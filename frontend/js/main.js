console.log("main.js: Initializing AR detector...");
const info = document.getElementById("info");
const arButton = document.getElementById("arButton");
const stopButton = document.getElementById("stopButton");
const resetBtn = document.getElementById("resetBtn");

// Fallback: Ensure button shows if JS fails
arButton.style.display = 'block';

async function supportsWebXR() {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

(async () => {
  try {
    info.textContent = "Detecting AR support...";
    arButton.disabled = true;
    const xrSupported = await supportsWebXR();
    arButton.disabled = false;

    if (xrSupported) {
      info.textContent = "AR ready—tap to start measuring";
      arButton.textContent = "Start AR";
      await import("./app.js");  // Load AR module
    } else {
      info.textContent = "AR unavailable—using camera mode";
      arButton.textContent = "Start Camera Measure";
      arButton.onclick = async () => {
        arButton.style.display = 'none';
        info.textContent = "Loading camera...";
        await import("./opencvMeasure.js");
        resetBtn.style.display = 'block';
      };
    }
  } catch (error) {
    console.error("Main init error:", error);
    info.textContent = "Error loading—button ready for manual start";
    arButton.onclick = () => window.location.reload();  // Reload on tap
  }
})();
