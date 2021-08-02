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

  uniform sampler2D Texture;
  varying vec2 fragTexCoord;

  void main() {
    vec4 c = texture2D(Texture, fragTexCoord);
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

// top-left orientation.
const vertices_tl = new Float32Array([
  //  X, Y, U, V
  -1.0,
  0.75,
  0.0,
  1.0, // left-bottom

  -1.0,
  1.0,
  0.0,
  0.0, // left-top

  -0.25,
  0.75,
  1.0,
  1.0, // right-bottom

  -0.25,
  1.0,
  1.0,
  0.0, // right-top
]);

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
// (taken nearly verbatim from some W3c or MDN doc)
//
function loadTexture(gl, url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                1, 1, border, srcFormat, srcType,
                pixel);

  const image = new Image();
  image.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  };
  image.src = url;

  return texture;
}

function createShader(gl, type, script) {
  var shader = gl.createShader(type);

  gl.shaderSource(shader, script);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(
      `Shader compilation failed: ${gl.getShaderInfoLog(shader)}`
    );

  return shader;
}

function newProgram(gl, vertexShader, fragmentShader) {
  var program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(`Shader linking failed: ${gl.getError()}`);

  return program;
}

export default class VideoVsyncTool {
  constructor() {
    this.vao = null;
    this.vbo = null;
    this.program = null;
    this.frame_id = 0;
    this.texID_rsync = null;
    this.texID_csync = null;
  }

  initVertexBuffers(gl) {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices_tl, gl.STATIC_DRAW, 0);
  }

  initTextures(gl) {
    this.texID_rsync = loadTexture(gl, "vendors/rvsync.gif");
    this.texID_csync = loadTexture(gl, "vendors/cvsync.gif");
  }

  initShaders(gl) {
    const fragShader = createShader(gl, 
      gl.FRAGMENT_SHADER,
      fragShaderScript
    );
    const vertShader = createShader(gl, 
      gl.VERTEX_SHADER,
      vertShaderScript
    );

    this.program = newProgram(gl, fragShader, vertShader);

    const vertAttrib = gl.getAttribLocation(this.program, `vert`);
    gl.enableVertexAttribArray(vertAttrib);
    gl.vertexAttribPointer(vertAttrib, 2, gl.FLOAT, false, 4 * 4, 0);

    const texCoordAttrib = gl.getAttribLocation(
      this.program,
      `vertTexCoord`
    );
    gl.enableVertexAttribArray(texCoordAttrib);
    gl.vertexAttribPointer(
      texCoordAttrib,
      2,
      gl.FLOAT,
      false,
      4 * 4,
      2 * 4
    );
  }

  renderFlasher(gl) {
    if (this.frame_id & 1)
      gl.bindTexture(gl.TEXTURE_2D, this.texID_rsync);
    else
      gl.bindTexture(gl.TEXTURE_2D, this.texID_csync);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ++this.frame_id;
  }

  renderGraphs(gl) {
    // TODO ?
    // (word of caution: graphs will probably be neigh useless due to spectre mitigation damaging the readout of Now(),
    //  andf so I can't really suggest that they're at all worth the time they're require to implement using GL Shaders)
  }
}
