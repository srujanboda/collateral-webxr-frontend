// frontend/js/opencvMeasure.js
// Simple 2D measurement using OpenCV.js (requires opencv.js loaded in HTML)

console.log("opencvMeasure.js loaded");

let imgElement = document.getElementById("inputImage");
let canvas = document.getElementById("measureCanvas");
let ctx = canvas.getContext("2d");

let clickPoints = [];

function loadImageIntoCanvas() {
  canvas.width = imgElement.width;
  canvas.height = imgElement.height;
  ctx.drawImage(imgElement, 0, 0);

  clickPoints = [];
}

imgElement.onload = loadImageIntoCanvas;

// Add click to place measurement points
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  clickPoints.push({ x, y });

  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (clickPoints.length === 2) {
    drawMeasurement();
  }
});

function drawMeasurement() {
  let p1 = clickPoints[0];
  let p2 = clickPoints[1];

  // Draw line
  ctx.strokeStyle = "yellow";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // Pixel distance
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);

  // If you know reference object size, convert:
  // const pixelsPerCM = knownPixelWidth / knownRealWidthCM;
  // const cm = pixelDist / pixelsPerCM;

  alert("Distance (pixels): " + pixelDist.toFixed(2));
}

window.loadImageIntoCanvas = loadImageIntoCanvas;
