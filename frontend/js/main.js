// js/main.js  ← FINAL WORKING VERSION
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
    startBtn.onclick = () => import("./app.js");  // AR mode
  } else {
    info.textContent = "2D Camera Mode";
    startBtn.textContent = "Start Camera";
    // Load AND run the 2D fallback immediately when button is clicked
    startBtn.onclick = async () => {
  try {
    await import("./app.js");
  } catch (e) {
    console.error("AR failed:", e);
    info.textContent = "AR not supported — switching to 2D Camera";
    await import("./opencvMeasure.js");
  }
};
  }

  startBtn.disabled = false;
})();
