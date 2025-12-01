// js/main.js
// This file is ONLY for exporting the WebXR detection function
// It is used by index.html when the user clicks "Start Camera"

export async function supportsWebXR() {
  if (!navigator.xr) return false;

  try {
    // Some browsers (especially older Android) can hang forever here → add timeout
    const supported = await Promise.race([
      navigator.xr.isSessionSupported("immersive-ar"),
      new Promise(resolve => setTimeout(() => resolve(false), 2500))
    ]);
    return supported;
  } catch (err) {
    console.warn("WebXR check failed:", err);
    return false;
  }
}
