console.log("main.js: Starting...");
async function supportsWebXR() {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}
(async () => {
  const info = document.getElementById("info");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  info.textContent = "Detecting device...";
  startBtn.disabled = true;
  const xrSupported = await supportsWebXR();
  if (xrSupported) {
    info.textContent = "AR Mode Ready! Tap to start";
    startBtn.textContent = "Start AR Measurement";
    startBtn.onclick = async () => {
      startBtn.style.display = 'none'; // Hide immediately
      await import("./app.js");
      // Optionally show resetBtn if needed in AR
      resetBtn.style.display = 'block';
    };
  } else {
    info.textContent = "2D Camera Mode";
    startBtn.textContent = "Start Camera";
    startBtn.onclick = async () => {
      startBtn.style.display = 'none'; // Hide immediately
      info.textContent = "Switching to 2D Camera";
      await import("./opencvMeasure.js");
      resetBtn.style.display = 'block';
    };
  }
  startBtn.disabled = false;
})();
