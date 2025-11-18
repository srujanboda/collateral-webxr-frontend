// main.js
// Detect WebXR AR support and dynamically load the appropriate module

async function supportsWebXR() {
  if (!navigator.xr) return false;

  // Timeout wrapper to avoid hanging on certain mobile browsers
  return Promise.race([
    navigator.xr.isSessionSupported("immersive-ar"),
    new Promise(resolve => setTimeout(() => resolve(false), 2000))
  ]).catch(err => {
    console.warn("WebXR check failed:", err);
    return false;
  });
}

(async () => {
  const infoBox = document.getElementById("info");
  infoBox.textContent = "Checking device capabilities...";

  const xrSupported = await supportsWebXR();

  if (xrSupported) {
    infoBox.textContent = "Starting AR Measurement Mode...";
    console.log("✅ WebXR supported: loading AR module...");

    import("./js/app.js")
      .then(() => console.log("Loaded WebXR AR mode successfully."))
      .catch(err => {
        console.error("❌ Error loading AR module:", err);
        infoBox.textContent = "Failed to load AR mode.";
      });

  } else {
    infoBox.textContent = "WebXR not supported. Starting camera mode...";
    console.log("⚠️ WebXR not supported: using camera fallback.");

    const video = document.getElementById("videoFeed");

    // Delay slightly to ensure DOM updates first
    setTimeout(() => {
      video.style.display = "block";
      import("./js/opencvMeasure.js")
        .then(() => console.log("Loaded OpenCV fallback mode."))
        .catch(err => {
          console.error("❌ Error loading OpenCV mode:", err);
          infoBox.textContent = "Failed to load fallback mode.";
        });
    }, 300);
  }
})();
