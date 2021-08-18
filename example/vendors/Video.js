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
    gl_FragColor = vec4(c.bgr, 1.0);
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

    this.useGL = true
    this.configure(this.canvas.getContext('webgl2'));
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

  updateViewport() {
    this.canvas.width  = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);
  }

  render() {
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
  }
}
