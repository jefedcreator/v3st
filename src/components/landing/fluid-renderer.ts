export type FluidOptions = {
  mouseForce: number;
  cursorSize: number;
  isViscous: boolean;
  viscous: number;
  iterationsViscous: number;
  dt: number;
  iterationsPoisson: number;
  resolution: number;
  dissipation: number;
  isBounce: boolean;
  autoDemo: boolean;
  autoSpeed: number;
  autoIntensity: number;
  takeoverDuration: number;
  autoResumeDelay: number;
  autoRampDuration: number;
  colors: readonly [string, string, string];
};

export const fluidDefaults: FluidOptions = {
  mouseForce: 15,
  cursorSize: 300,
  isViscous: false,
  viscous: 30,
  iterationsViscous: 14,
  dt: 0.011,
  iterationsPoisson: 38,
  resolution: 0.5,
  dissipation: 0.992,
  isBounce: true,
  autoDemo: true,
  autoSpeed: 0.28,
  autoIntensity: 6.4,
  takeoverDuration: 0.25,
  autoResumeDelay: 350,
  autoRampDuration: 1.4,
  colors: ["#166534", "#3f8f5f", "#b9d987"],
};

export type FluidRenderer = {
  setPaused(paused: boolean): void;
  resize(): void;
  dispose(): void;
};

const MAX_DPR = 1.5;
const MAX_SIM_SIZE = 640;

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG_COPY = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
void main () { gl_FragColor = texture2D(uTexture, vUv); }
`;

const FRAG_CLEAR = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
`;

const FRAG_SPLAT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

const FRAG_ADVECTION = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
vec2 bilerp (sampler2D sam, vec2 uv, vec2 tsize, vec2 dx, vec2 dy) {
  vec2 st = uv / tsize - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec4 a = texture2D(sam, (i + vec2(0.0, 0.0)) * tsize + 0.5 * tsize);
  vec4 b = texture2D(sam, (i + vec2(1.0, 0.0)) * tsize + 0.5 * tsize);
  vec4 c = texture2D(sam, (i + vec2(0.0, 1.0)) * tsize + 0.5 * tsize);
  vec4 d = texture2D(sam, (i + vec2(1.0, 1.0)) * tsize + 0.5 * tsize);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main () {
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize, texelSize, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, texelSize, texelSize, texelSize);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`;

const FRAG_DIVERGENCE = `
precision mediump float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const FRAG_PRESSURE = `
precision mediump float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const FRAG_GRADIENT_SUBTRACT = `
precision mediump float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

const FRAG_VISCOUS = `
precision mediump float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float viscous;
uniform float dt;
void main () {
  vec2 old = texture2D(uSource, vUv).xy;
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  float alpha = 1.0 / max(viscous * dt, 0.0001);
  vec2 next = (alpha * old + vec2(L + R, T + B)) / (alpha + 4.0);
  gl_FragColor = vec4(next, 0.0, 1.0);
}
`;

const FRAG_DISPLAY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 background;
void main () {
  vec3 dye = texture2D(uTexture, vUv).rgb;
  vec3 color = mix(background, dye, clamp(length(dye) * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
}
`;

type ProgramInfo = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

function uniform(
  info: ProgramInfo,
  name: string,
): WebGLUniformLocation | null {
  return info.uniforms[name] ?? null;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? "unknown"}`);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  fragmentSource: string,
): ProgramInfo {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Program link failed: ${log ?? "unknown"}`);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

type FBO = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
};

function createFBO(
  gl: WebGLRenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
): FBO {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Unable to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelSizeX: 1 / w,
    texelSizeY: 1 / h,
    attach(id: number) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };
}

function createDoubleFBO(
  gl: WebGLRenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
): { width: number; height: number; texelSizeX: number; texelSizeY: number; read: FBO; write: FBO; swap(): void } {
  let fbo1 = createFBO(gl, w, h, internalFormat, format, type, filter);
  let fbo2 = createFBO(gl, w, h, internalFormat, format, type, filter);
  return {
    width: w,
    height: h,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    get read() {
      return fbo1;
    },
    get write() {
      return fbo2;
    },
    swap() {
      const tmp = fbo1;
      fbo1 = fbo2;
      fbo2 = tmp;
    },
  };
}

export function createFluidRenderer(
  canvas: HTMLCanvasElement,
  options: FluidOptions,
): FluidRenderer {
  const context = canvas.getContext("webgl", {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!context) {
    throw new Error("WebGL is not available");
  }
  const gl: WebGLRenderingContext = context;
  const extFloat = gl.getExtension("OES_texture_float");
  const extFloatLinear = gl.getExtension("OES_texture_float_linear");
  if (!extFloat) {
    throw new Error("WebGL with float textures is not available");
  }
  const filter = extFloatLinear ? gl.LINEAR : gl.NEAREST;
  const type = gl.FLOAT;
  const formatRGBA = gl.RGBA;

  const programs = {
    copy: createProgram(gl, FRAG_COPY),
    clear: createProgram(gl, FRAG_CLEAR),
    splat: createProgram(gl, FRAG_SPLAT),
    advection: createProgram(gl, FRAG_ADVECTION),
    divergence: createProgram(gl, FRAG_DIVERGENCE),
    pressure: createProgram(gl, FRAG_PRESSURE),
    gradientSubtract: createProgram(gl, FRAG_GRADIENT_SUBTRACT),
    viscous: createProgram(gl, FRAG_VISCOUS),
    display: createProgram(gl, FRAG_DISPLAY),
  };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW,
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  let simWidth = 0;
  let simHeight = 0;
  let dyeWidth = 0;
  let dyeHeight = 0;
  let velocity: ReturnType<typeof createDoubleFBO> | null = null;
  let dye: ReturnType<typeof createDoubleFBO> | null = null;
  let divergence: FBO | null = null;
  let pressure: ReturnType<typeof createDoubleFBO> | null = null;

  const background = hexToRgb("#f7f8f2");
  const dyeColors = options.colors.map(hexToRgb);

  function blit(target: FBO | null) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  function initFramebuffers() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    simWidth = Math.max(1, Math.min(MAX_SIM_SIZE, Math.floor(width * options.resolution)));
    simHeight = Math.max(1, Math.min(MAX_SIM_SIZE, Math.floor(height * options.resolution)));
    dyeWidth = Math.max(1, Math.min(MAX_SIM_SIZE * 2, Math.floor(width * Math.max(options.resolution, 0.35))));
    dyeHeight = Math.max(1, Math.min(MAX_SIM_SIZE * 2, Math.floor(height * Math.max(options.resolution, 0.35))));
    velocity = createDoubleFBO(gl, simWidth, simHeight, formatRGBA, formatRGBA, type, filter);
    dye = createDoubleFBO(gl, dyeWidth, dyeHeight, formatRGBA, formatRGBA, type, filter);
    divergence = createFBO(gl, simWidth, simHeight, formatRGBA, formatRGBA, type, gl.NEAREST);
    pressure = createDoubleFBO(gl, simWidth, simHeight, formatRGBA, formatRGBA, type, gl.NEAREST);
  }

  function splat(x: number, y: number, dx: number, dy: number, color: [number, number, number]) {
    if (!velocity || !dye) return;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const radius = Math.max(0.00005, options.cursorSize / 100000);
    gl.useProgram(programs.splat.program);
    gl.uniform1i(uniform(programs.splat, "uTarget"), velocity.read.attach(0));
    gl.uniform1f(uniform(programs.splat, "aspectRatio"), aspect);
    gl.uniform2f(uniform(programs.splat, "point"), x, y);
    gl.uniform3f(uniform(programs.splat, "color"), dx, dy, 0);
    gl.uniform1f(uniform(programs.splat, "radius"), radius);
    blit(velocity.write);
    velocity.swap();
    gl.uniform1i(uniform(programs.splat, "uTarget"), dye.read.attach(0));
    gl.uniform3f(uniform(programs.splat, "color"), color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function step(dtSeconds: number) {
    if (!velocity || !dye || !divergence || !pressure) return;
    gl.disable(gl.BLEND);

    if (options.isViscous) {
      gl.useProgram(programs.viscous.program);
      gl.uniform2f(uniform(programs.viscous, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1f(uniform(programs.viscous, "viscous"), options.viscous);
      gl.uniform1f(uniform(programs.viscous, "dt"), dtSeconds);
      gl.uniform1i(uniform(programs.viscous, "uVelocity"), velocity.read.attach(0));
      gl.uniform1i(uniform(programs.viscous, "uSource"), velocity.read.attach(1));
      for (let i = 0; i < options.iterationsViscous; i += 1) {
        gl.uniform1i(uniform(programs.viscous, "uVelocity"), velocity.read.attach(0));
        gl.uniform1i(uniform(programs.viscous, "uSource"), velocity.write.attach(1));
        blit(velocity.write);
        velocity.swap();
      }
    }

    gl.useProgram(programs.divergence.program);
    gl.uniform2f(uniform(programs.divergence, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(uniform(programs.divergence, "uVelocity"), velocity.read.attach(0));
    blit(divergence);

    gl.useProgram(programs.clear.program);
    gl.uniform1i(uniform(programs.clear, "uTexture"), pressure.read.attach(0));
    gl.uniform1f(uniform(programs.clear, "value"), 0.8);
    blit(pressure.write);
    pressure.swap();

    gl.useProgram(programs.pressure.program);
    gl.uniform2f(uniform(programs.pressure, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(uniform(programs.pressure, "uDivergence"), divergence.attach(0));
    for (let i = 0; i < options.iterationsPoisson; i += 1) {
      gl.uniform1i(uniform(programs.pressure, "uPressure"), pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gl.useProgram(programs.gradientSubtract.program);
    gl.uniform2f(uniform(programs.gradientSubtract, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(uniform(programs.gradientSubtract, "uPressure"), pressure.read.attach(0));
    gl.uniform1i(uniform(programs.gradientSubtract, "uVelocity"), velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    gl.useProgram(programs.advection.program);
    gl.uniform2f(uniform(programs.advection, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    if (!extFloatLinear) {
      gl.uniform2f(uniform(programs.advection, "texelSize"), velocity.texelSizeX, velocity.texelSizeY);
    }
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(uniform(programs.advection, "uVelocity"), velocityId);
    gl.uniform1i(uniform(programs.advection, "uSource"), velocityId);
    gl.uniform1f(uniform(programs.advection, "dt"), dtSeconds);
    gl.uniform1f(uniform(programs.advection, "dissipation"), 0);
    blit(velocity.write);
    velocity.swap();

    gl.uniform2f(uniform(programs.advection, "texelSize"), dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(uniform(programs.advection, "uVelocity"), velocity.read.attach(0));
    gl.uniform1i(uniform(programs.advection, "uSource"), dye.read.attach(1));
    gl.uniform1f(uniform(programs.advection, "dissipation"), options.dissipation - 1);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    if (!dye) return;
    gl.useProgram(programs.display.program);
    gl.uniform1i(uniform(programs.display, "uTexture"), dye.read.attach(0));
    gl.uniform3f(uniform(programs.display, "background"), background[0], background[1], background[2]);
    blit(null);
  }

  let raf = 0;
  let paused = false;
  let last = performance.now();
  let autoRamp = options.autoDemo ? 1 : 0;
  let lastPointerMove = -Infinity;
  let lastX = 0;
  let lastY = 0;
  let colorIndex = 0;

  const pickColor = (scale = 0.35): [number, number, number] => {
    const c: [number, number, number] =
      dyeColors[colorIndex % dyeColors.length] ?? [0.09, 0.4, 0.2];
    colorIndex += 1;
    return [c[0] * scale, c[1] * scale, c[2] * scale];
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
    const dx = (x - lastX) * options.mouseForce;
    const dy = (y - lastY) * options.mouseForce;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      splat(x, y, dx, dy, pickColor());
    }
    lastX = x;
    lastY = y;
    lastPointerMove = performance.now();
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (paused) {
      last = now;
      return;
    }
    const dtSeconds = Math.min((now - last) / 1000, 0.066) * (options.dt / 0.011);
    last = now;

    const pointerActive = now - lastPointerMove < options.autoResumeDelay;
    const autoTarget = options.autoDemo && !pointerActive ? 1 : 0;
    const rate = autoTarget === 1 ? 1 / options.autoRampDuration : 1 / options.takeoverDuration;
    autoRamp += (autoTarget - autoRamp) * Math.min(1, dtSeconds * 60 * rate * 0.016 * 60);
    autoRamp = Math.min(1, Math.max(0, autoRamp));

    if (options.autoDemo && autoRamp > 0) {
      const t = now / 1000;
      for (let i = 0; i < 2; i += 1) {
        const angle = t * options.autoSpeed * Math.PI * 2 + i * 2.1;
        const x = 0.5 + 0.32 * Math.sin(angle * 1.7 + i);
        const y = 0.5 + 0.32 * Math.cos(angle * 2.3 + i * 1.3);
        const dx = options.autoIntensity * autoRamp * Math.cos(angle * 3.1);
        const dy = options.autoIntensity * autoRamp * Math.sin(angle * 2.7);
        splat(x, y, dx * 0.02, dy * 0.02, pickColor(0.35 * options.autoIntensity * 0.15));
      }
    }

    step(Math.max(dtSeconds, 0.0001) * 60 * 0.016);
    render();
  };

  canvas.addEventListener("pointermove", onPointerMove);
  initFramebuffers();
  raf = requestAnimationFrame((now) => {
    last = now;
    raf = requestAnimationFrame(frame);
  });

  return {
    setPaused(next: boolean) {
      paused = next;
    },
    resize() {
      initFramebuffers();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointerMove);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}
