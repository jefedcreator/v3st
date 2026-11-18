// The fluid background only runs when motion is allowed, the user hasn't
// asked to save data, and a WebGL context exists. Browser-safe; detectWebGL
// touches the DOM so it is only called client-side.

export function shouldRunFluid(input: {
  reducedMotion: boolean;
  saveData: boolean;
  webgl: boolean;
}): boolean {
  return !input.reducedMotion && !input.saveData && input.webgl;
}

export function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
