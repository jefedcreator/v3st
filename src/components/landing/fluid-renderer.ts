/** Original V3ST WebGL2 stable-fluid field; no third-party renderer source. */
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
  palette: readonly [string, string, string];
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
  palette: ["#E6EEDD", "#166534", "#B9D987"],
};

export function createFluidRenderer(
  canvas: HTMLCanvasElement,
  options: FluidOptions,
) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float"))
    throw new Error("Fluid field needs float WebGL2 targets");
  const resources: (() => void)[] = [];
  let disposed = false;
  let paused = true;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let lastPointer = -Infinity;
  let previousPointer = { x: 0.5, y: 0.5 };
  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0 };
  const vertex = `#version 300 es
  in vec2 a; out vec2 uv; void main(){ uv=a*.5+.5; gl_Position=vec4(a,0.,1.); }`;
  const prefix = `#version 300 es
  precision highp float; in vec2 uv; out vec4 color;
  uniform sampler2D field; uniform sampler2D velocity; uniform sampler2D divergence;
  uniform vec2 texel; uniform float dt; uniform float dissipation;`;
  function program(fragment: string) {
    const p = gl!.createProgram();
    if (!p) throw new Error("Fluid program unavailable");
    for (const [type, source] of [
      [gl!.VERTEX_SHADER, vertex],
      [gl!.FRAGMENT_SHADER, prefix + fragment],
    ] as const) {
      const shader = gl!.createShader(type);
      if (!shader) throw new Error("Fluid shader unavailable");
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(shader);
        gl!.deleteProgram(p);
        throw new Error("Fluid shader compilation failed");
      }
      gl!.attachShader(p, shader);
      gl!.deleteShader(shader);
    }
    gl!.linkProgram(p);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      gl!.deleteProgram(p);
      throw new Error("Fluid linking failed");
    }
    resources.push(() => gl!.deleteProgram(p));
    return p;
  }
  const programs: WebGLProgram[] = [];
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Fluid buffer unavailable");
  resources.push(() => gl.deleteBuffer(buffer));
  let velocityField: Target[] = [],
    dye: Target[] = [],
    pressure: Target[] = [],
    div: Target | undefined;
  type Target = {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    width: number;
    height: number;
  };
  const targets: Target[] = [];
  function releaseTargets() {
    for (const t of targets.splice(0)) {
      gl!.deleteTexture(t.texture);
      gl!.deleteFramebuffer(t.framebuffer);
    }
  }
  resources.push(releaseTargets);
  function target(width: number, height: number): Target {
    const texture = gl!.createTexture(),
      framebuffer = gl!.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Fluid target unavailable");
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA16F,
      width,
      height,
      0,
      gl!.RGBA,
      gl!.HALF_FLOAT,
      null,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffer);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    const result = { texture, framebuffer, width, height };
    targets.push(result);
    if (
      gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE
    )
      throw new Error("Fluid target incomplete");
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    return result;
  }
  const uniform = (p: WebGLProgram, name: string) =>
    gl!.getUniformLocation(p, name);
  function texture(p: WebGLProgram, name: string, t: Target, unit: number) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, t.texture);
    gl!.uniform1i(uniform(p, name), unit);
  }
  function draw(
    p: WebGLProgram,
    out: Target | null,
    input: Target,
    setup?: () => void,
  ) {
    gl!.useProgram(p);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, out?.framebuffer ?? null);
    gl!.viewport(
      0,
      0,
      out?.width ?? canvas.width,
      out?.height ?? canvas.height,
    );
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    const a = gl!.getAttribLocation(p, "a");
    gl!.enableVertexAttribArray(a);
    gl!.vertexAttribPointer(a, 2, gl!.FLOAT, false, 0, 0);
    texture(p, "field", input, 0);
    gl!.uniform2f(uniform(p, "texel"), 1 / input.width, 1 / input.height);
    gl!.uniform1f(uniform(p, "dt"), options.dt);
    gl!.uniform1f(uniform(p, "dissipation"), options.dissipation);
    setup?.();
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  const swap = (pair: Target[]) => {
    const first = pair[0]!;
    pair[0] = pair[1]!;
    pair[1] = first;
  };
  let advect: WebGLProgram,
    splat: WebGLProgram,
    divergence: WebGLProgram,
    poisson: WebGLProgram,
    project: WebGLProgram,
    display: WebGLProgram,
    viscous: WebGLProgram;
  try {
    advect = program(
      `vec4 sampleLinear(sampler2D source,vec2 p){vec2 xy=p/texel-.5;vec2 f=fract(xy);vec2 b=(floor(xy)+.5)*texel;return mix(mix(texture(source,b),texture(source,b+vec2(texel.x,0.)),f.x),mix(texture(source,b+vec2(0.,texel.y)),texture(source,b+texel),f.x),f.y);} void main(){vec2 v=texture(velocity,uv).xy;color=sampleLinear(field,clamp(uv-dt*v,texel,1.-texel))*dissipation;}`,
    );
    splat = program(
      `uniform vec2 point; uniform vec3 impulse; uniform float radius; uniform float aspect;void main(){vec2 d=uv-point;d.x*=aspect;float k=exp(-dot(d,d)/radius);color=texture(field,uv)+vec4(impulse*k,0.);}`,
    );
    divergence = program(
      `uniform float bounce;void main(){float l=texture(field,uv-vec2(texel.x,0.)).x;float r=texture(field,uv+vec2(texel.x,0.)).x;float b=texture(field,uv-vec2(0.,texel.y)).y;float t=texture(field,uv+vec2(0.,texel.y)).y;vec2 c=texture(field,uv).xy;if(bounce>.5){if(uv.x<texel.x)l=-c.x;if(uv.x>1.-texel.x)r=-c.x;if(uv.y<texel.y)b=-c.y;if(uv.y>1.-texel.y)t=-c.y;}color=vec4(.5*(r-l+t-b),0.,0.,1.);}`,
    );
    poisson = program(
      `void main(){float l=texture(field,uv-vec2(texel.x,0.)).x;float r=texture(field,uv+vec2(texel.x,0.)).x;float b=texture(field,uv-vec2(0.,texel.y)).x;float t=texture(field,uv+vec2(0.,texel.y)).x;float d=texture(divergence,uv).x;color=vec4((l+r+b+t-d)*.25,0.,0.,1.);}`,
    );
    project = program(
      `void main(){float l=texture(field,uv-vec2(texel.x,0.)).x;float r=texture(field,uv+vec2(texel.x,0.)).x;float b=texture(field,uv-vec2(0.,texel.y)).x;float t=texture(field,uv+vec2(0.,texel.y)).x;vec2 v=texture(velocity,uv).xy-.5*vec2(r-l,t-b);color=vec4(v,0.,1.);}`,
    );
    viscous = program(
      `uniform float strength;void main(){vec4 c=texture(field,uv);vec4 n=texture(field,uv+vec2(texel.x,0.))+texture(field,uv-vec2(texel.x,0.))+texture(field,uv+vec2(0.,texel.y))+texture(field,uv-vec2(0.,texel.y));color=(c+strength*n)/(1.+4.*strength);}`,
    );
    display = program(
      `uniform vec3 sage;uniform vec3 forest;uniform vec3 fresh;void main(){vec3 d=texture(field,uv).rgb;float density=clamp(length(d),0.,1.);vec3 c=mix(sage,fresh,clamp(d.b,0.,1.));c=mix(c,forest,clamp(d.g*.3,0.,.45));float edge=smoothstep(.15,.6,abs(uv.x-.5));color=vec4(c,density*(.16+edge*.42));}`,
    );
    programs.push(
      advect,
      splat,
      divergence,
      poisson,
      project,
      display,
      viscous,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
  } catch (error) {
    for (const dispose of resources.reverse()) dispose();
    throw error;
  }
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(
      2,
      Math.round(
        Math.min(rect.width, 1600) *
          Math.min(devicePixelRatio, 1.5) *
          options.resolution,
      ),
    );
    const height = Math.max(
      2,
      Math.round((width * rect.height) / Math.max(rect.width, 1)),
    );
    if (canvas.width === width && canvas.height === height && targets.length)
      return;
    canvas.width = width;
    canvas.height = height;
    releaseTargets();
    // Solver grid is bounded separately from display resolution; no device can allocate an unbounded field.
    const solverWidth = Math.min(160, width),
      solverHeight = Math.max(16, Math.round((solverWidth * height) / width));
    try {
      velocityField = [
        target(solverWidth, solverHeight),
        target(solverWidth, solverHeight),
      ];
      pressure = [
        target(solverWidth, solverHeight),
        target(solverWidth, solverHeight),
      ];
      div = target(solverWidth, solverHeight);
      dye = [target(width, height), target(width, height)];
    } catch (error) {
      dispose();
      throw error;
    }
  }
  function inject(
    pair: Target[],
    x: number,
    y: number,
    values: [number, number, number],
  ) {
    draw(splat, pair[1]!, pair[0]!, () => {
      gl!.uniform2f(uniform(splat, "point"), x, y);
      gl!.uniform3f(uniform(splat, "impulse"), ...values);
      gl!.uniform1f(uniform(splat, "aspect"), canvas.width / canvas.height);
      gl!.uniform1f(
        uniform(splat, "radius"),
        Math.pow(options.cursorSize / Math.max(canvas.clientWidth, 1), 2) *
          0.08,
      );
    });
    swap(pair);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || paused) return;
    const delta = previous ? Math.min((now - previous) / 1000, 0.064) : 0.033;
    if (previous && now - previous < 32) {
      frame = requestAnimationFrame(tick);
      return;
    }
    previous = now;
    elapsed += delta;
    const idle = Math.max(
      0,
      (now - lastPointer - options.autoResumeDelay) / 1000,
    );
    const auto = options.autoDemo
      ? Math.min(1, idle / options.autoRampDuration)
      : 0;
    const take =
      1 - Math.exp(-delta / Math.max(options.takeoverDuration, 0.001));
    const x = 0.5 + Math.sin(elapsed * options.autoSpeed) * 0.38,
      y = 0.5 + Math.cos(elapsed * options.autoSpeed * 1.37) * 0.34;
    const px = pointer.x + (x - pointer.x) * auto,
      py = pointer.y + (y - pointer.y) * auto;
    const dx =
        (px - previousPointer.x) *
        options.mouseForce *
        (auto ? options.autoIntensity : 1),
      dy =
        (py - previousPointer.y) *
        options.mouseForce *
        (auto ? options.autoIntensity : 1);
    previousPointer = {
      x: previousPointer.x + (px - previousPointer.x) * take,
      y: previousPointer.y + (py - previousPointer.y) * take,
    };
    inject(velocityField, px, py, [dx, dy, 0]);
    inject(dye, px, py, [0.025, 0.055, 0.075]);
    draw(advect, velocityField[1]!, velocityField[0]!, () =>
      texture(advect, "velocity", velocityField[0]!, 1),
    );
    swap(velocityField);
    if (options.isViscous)
      for (let i = 0; i < options.iterationsViscous; i++) {
        draw(viscous, velocityField[1]!, velocityField[0]!, () =>
          gl!.uniform1f(
            uniform(viscous, "strength"),
            options.viscous * options.dt,
          ),
        );
        swap(velocityField);
      }
    draw(divergence, div!, velocityField[0]!, () =>
      gl!.uniform1f(uniform(divergence, "bounce"), Number(options.isBounce)),
    );
    for (let i = 0; i < options.iterationsPoisson; i++) {
      draw(poisson, pressure[1]!, pressure[0]!, () =>
        texture(poisson, "divergence", div!, 1),
      );
      swap(pressure);
    }
    draw(project, velocityField[1]!, pressure[0]!, () =>
      texture(project, "velocity", velocityField[0]!, 1),
    );
    swap(velocityField);
    draw(advect, dye[1]!, dye[0]!, () =>
      texture(advect, "velocity", velocityField[0]!, 1),
    );
    swap(dye);
    draw(display, null, dye[0]!, () => {
      for (const [i, name] of ["sage", "forest", "fresh"].entries())
        gl!.uniform3f(uniform(display, name), ...rgb(options.palette[i]!));
    });
    frame = requestAnimationFrame(tick);
  }
  function move(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointer.y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    lastPointer = performance.now();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    for (const release of resources.reverse()) release();
  }
  window.addEventListener("pointermove", move, { passive: true });
  resize();
  return {
    setPaused(value: boolean) {
      paused = value;
      previous = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      if (!paused && !disposed) frame = requestAnimationFrame(tick);
    },
    resize,
    dispose,
  };
}
