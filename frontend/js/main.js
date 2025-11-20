// js/main.js
console.log("main.js loaded");

async function supportsWebXR() {
  if (!navigator.xr) return false;
  return await navigator.xr.isSessionSupported("immersive-ar").catch(() => false);
}

(async () => {
  const info = document.getElementById("info");

  // Update UI immediately
  document.getElementById("startBtn").textContent = "Checking Device...";
  
  const xrSupported = await supportsWebXR();

  if (xrSupported) {
    info.textContent = "AR Mode Ready! Tap Start";
    console.log("WebXR supported → will load AR");
    document.getElementById("startBtn").onclick = () => import("./app.js");
  } else {
    info.textContent = "Using 2D Camera Mode";
    console.log("No WebXR → using camera fallback");
    document.getElementById("startBtn").onclick = () => import("./opencvMeasure.js");
  }

  // Now re-enable the button
  document.getElementById("startBtn").textContent = "Start Camera";
})();
