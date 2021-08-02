import VideoVsyncTool from "./VideoVsyncTool.js";

const vertShaderScript = `
  precision mediump float;

  attribute vec2 vert;
  attribute vec2 vertTexCoord;

  varying vec2 fragTexCoord;

  void main() {
    fragTexCoord = vertTexCoord;
    gl_Position = vec4(vert, 0.0, 1.0);
  }
`;

const fragShaderScript = `
  precision mediump float;

  uniform vec2 OutputSize;
  uniform vec2 InputSize;
  uniform sampler2D Texture;
  varying vec2 fragTexCoord;

  void main() {
    vec4 c = texture2D(Texture, fragTexCoord);
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

const vertices = new Float32Array([
  //  X, Y, U, V
  -1.0,
  -1.0,
  0.0,
  1.0, // left-bottom

  -1.0,
  1.0,
  0.0,
  0.0, // left-top

  1.0,
  -1.0,
  1.0,
  1.0, // right-bottom

  1.0,
  1.0,
  1.0,
  0.0, // right-top
]);

export default class Video {
  constructor(canvas) {
    this.canvas = canvas;

    this.gl = null;

    this.vao = null;
    this.vbo = null;
    this.texID = null;

    this.format = 0;
    this.pitch = 0;
    this.pixFmt = null;
    this.pixType = null;
    this.bpp = 0;

    this.width = 0;
    this.height = 0;

    this.data = null;
    this.program = null;

    // Js API is just useless, you can't call getContext without recreating the full canvas
    this.useGL = false
    if (this.useGL) {
      this.configure(this.canvas.getContext('webgl2'));
      this.vsyncTool = new VideoVsyncTool();
    } else {
      this.nogl = this.canvas.getContext('2d')
      this.vsyncTool = null
    }
  }

  updateFilter() {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texID);

    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.useProgram(this.program);
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.program, `TextureSize`),
      this.width,
      this.height
    );
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.program, `InputSize`),
      this.width,
      this.height
    );
  }

  setPixelFormat(format) {
    this.format = format;

    if (!this.useGL) {
      // no webgl we are done
      return
    }

    switch (format) {
      case 0: // RETRO_PIXEL_FORMAT_0RGB1555
        this.intFmt = this.gl.RGB;
        this.pixFmt = this.gl.UNSIGNED_SHORT_5_5_5_1;
        this.pixType = this.gl.BGRA;
        this.bpp = 2;
        this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, this.pitch / this.bpp);
        return true;
      case 1: // RETRO_PIXEL_FORMAT_XRGB8888
        this.intFmt = this.gl.RGBA;
        this.pixFmt = this.gl.UNSIGNED_BYTE;
        this.pixType = this.gl.RGBA;
        this.bpp = 4;
        this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, this.pitch / this.bpp);
        return true;
      case 2: // RETRO_PIXEL_FORMAT_RGB565
        this.intFmt = this.gl.RGB;
        this.pixFmt = this.gl.UNSIGNED_SHORT_5_6_5;
        this.pixType = this.gl.RGB;
        this.bpp = 2;
        this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, this.pitch / this.bpp);
        return true;
      default:
        console.log("[Video]: Unknown pixel format: ", format);
    }

    this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, this.pitch / this.bpp);
    return false;
  }

  setInputSize(width, height, pitch) {
    this.width = width;
    this.height = height;
    this.pitch = pitch;
  }

  setInputData(data) {
    if (!data) return;

    this.data = data;
  }

  configure(gl) {

    this.gl = gl;
    this.gl.clearColor(0, 0, 0, 0);

    if (this.vsyncTool) {
        this.vsyncTool.initTextures(gl);
        this.vsyncTool.initVertexBuffers(gl);
        this.vsyncTool.initShaders(gl);
    }

    const fragShader = this.createShader(
      this.gl.FRAGMENT_SHADER,
      fragShaderScript
    );
    const vertShader = this.createShader(
      this.gl.VERTEX_SHADER,
      vertShaderScript
    );
    this.program = this.newProgram(fragShader, vertShader);

    this.gl.useProgram(this.program);

    const textureUniform = this.gl.getUniformLocation(this.program, `Texture`);
    this.gl.uniform1i(textureUniform, 0);

    // Configure the vertex data
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    this.vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW, 0);

    const vertAttrib = this.gl.getAttribLocation(this.program, `vert`);
    this.gl.enableVertexAttribArray(vertAttrib);
    this.gl.vertexAttribPointer(vertAttrib, 2, this.gl.FLOAT, false, 4 * 4, 0);

    const texCoordAttrib = this.gl.getAttribLocation(
      this.program,
      `vertTexCoord`
    );
    this.gl.enableVertexAttribArray(texCoordAttrib);
    this.gl.vertexAttribPointer(
      texCoordAttrib,
      2,
      this.gl.FLOAT,
      false,
      4 * 4,
      2 * 4
    );

    // Some cores won't call SetPixelFormat, provide default values
    if (!this.pixFmt) {
      this.intFmt = this.gl.RGB;
      this.pixFmt = this.gl.UNSIGNED_SHORT_5_6_5;
      this.pixType = this.gl.RGB;
      this.bpp = 2;
    }

    this.texID = this.gl.createTexture();

    this.gl.activeTexture(this.gl.TEXTURE0);
    if (!this.texID)
      throw new Error("[Video]: Failed to create the vid texture");

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texID);

    this.updateFilter();

    this.updateViewport();
  }

  createShader(type, script) {
    let shader = this.gl.createShader(type);

    this.gl.shaderSource(shader, script);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
      throw new Error(
        `Shader compilation failed: ${this.gl.getShaderInfoLog(shader)}`
      );

    return shader;
  }

  newProgram(vertexShader, fragmentShader) {
    let program = this.gl.createProgram();

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);

    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
      throw new Error(`Shader linking failed: ${this.gl.getError()}`);

    return program;
  }

  updateCanvasSize() {
    const width = Math.max(1, this.width)
    const height = Math.max(1, this.height)

    if (this.canvas) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }


  updateViewport() {
    // the canvas in WebGL appears to be analogous to an FBO in regular GL terms, and this FBO will
    // be stretched to fit the client area of the div that the canvas is attached to. FBO rendering
    // behavior onto the canvas is controlled via canvas CSS settings (image-rendering attribute).
    //
    // For most purposes we want the canvas size to match the client area of the canvas, and then control
    // rendering behavior using more standard and flexible OpenGL texturing settings. The main advantage
    // of using a smaller fixed canvas (fbo) would be for performance: smaller canvas translates into
    // slightly less memory and fillrate. (maybe relevant to mobile devices, probably useless on desktops)

    let width  = Math.max(1, this.canvas.clientWidth );
    let height = Math.max(1, this.canvas.clientHeight);

    if (this.canvas) {
      // sets the borwser's internal FBO size (frontbufferobject)
      this.canvas.width  = width ;
      this.canvas.height = height;
    }

    if (this.gl.viewport) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  renderNoGL() {
    let front_buffer = this.nogl.createImageData(
      this.canvas.width,
      this.canvas.height
    )
    let buf = front_buffer.data
    let out = 0
    switch (this.format) {
      case 2: // RETRO_PIXEL_FORMAT_RGB565
        for (let y = 0; y < this.height; y++) {
          // in_line index is in pixel, but this.pitch is in byte
          let in_line = (this.pitch / 2) * y
          out = this.canvas.width * 4 * y
          for (let x = 0; x < this.width; x++) {
            let input = in_line + x // data is uint16 array, so pixel indexed
            let color = this.data[input]
            buf[out] = (color & 0xf800) >> 8
            out++
            buf[out] = (color & 0x07e0) >> 3
            out++
            buf[out] = (color & 0x001f) << 3
            out++
            buf[out] = 255
            out++
          }
        }
        break
      case 1: // RETRO_PIXEL_FORMAT_XRGB8888
        for (let y = 0; y < this.height; y++) {
          let in_line = this.pitch * y
          out = this.canvas.width * 4 * y
          for (let x = 0; x < this.width; x++) {
            // Swap RED and BLUE channel
            let input = in_line + x * 4 // data is uint8 array
            buf[out] = this.data[input + 2]
            out++
            buf[out] = this.data[input + 1]
            out++
            buf[out] = this.data[input + 0]
            out++
            buf[out] = 255
            out++
          }
        }
        break
      default:
        break
    }
    createImageBitmap(front_buffer, 0, 0, this.width, this.height).then(
      (image) => {
        this.nogl.drawImage(
          image,
          0,
          0,
          this.canvas.width,
          this.canvas.height
        )
      }
    )
  }

  renderGL() {
    this.updateViewport();

    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texID);
    this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, this.pitch / this.bpp);

    this.gl.useProgram(this.program);
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.program, `TextureSize`),
      this.width,
      this.height
    );
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.program, `InputSize`),
      this.width,
      this.height
    );
    this.gl.uniform2f(
      this.gl.getUniformLocation(this.program, `OutputSize`),
      this.width,
      this.height
    );

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.intFmt,
      this.width,
      this.height,
      0,
      this.pixType,
      this.pixFmt,
      this.data
    );

    this.gl.bindVertexArray(this.vao);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texID);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    if (this.vsyncTool) {
        this.vsyncTool.renderFlasher(this.gl);
    }
  }

    render() {
        if (
            !this.data ||
            this.width === 0 ||
            this.height === 0 ||
            this.pitch === 0
        )
            return

        this.updateCanvasSize()

        if (this.gl == null) {
            this.useGL = false
        }
        if (this.useGL) {
            this.renderGL()
        } else {
            this.renderNoGL()
        }
    }
}
