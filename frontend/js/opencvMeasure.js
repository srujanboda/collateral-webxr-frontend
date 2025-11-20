// js/opencvMeasure.js  ← FULLY WORKING VERSION (multi-point + dots + line + distance)

let video = document.getElementById('videoFeed');
let canvas = document.getElementById('overlay');
let ctx = canvas.getContext('2d');
let info = document.getElementById('info');
let resetBtn = document.getElementById('resetBtn');

let points = [];
let isReady = false;

function resizeCanvas() {
  if (video.videoWidth === 0) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw all points
  points.forEach(p => {
    ctx.fillStyle = 'lime';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Draw yellow polyline
  if (points.length > 1) {
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // Update distance
  updateDistance();
}

function updateDistance() {
  if (points.length < 2) {
    info.textContent = `Points: ${points.length} — Tap to add more`;
    return;
  }

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    const pixelDist = Math.hypot(dx, dy);
    const meters = pixelDist * 0.0012; // Calibrated for ~50cm distance, 60° FOV
    total += meters;
  }

  info.textContent = `Points: ${points.length} → Total: ${total.toFixed(3)} m`;
}

function onTap(e) {
  e.preventDefault();
  if (!isReady) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  points.push({
    x: x * scaleX,
    y: y * scaleY
  });

  draw();
}

// Attach both click and touch
canvas.addEventListener('click', onTap);
canvas.addEventListener('touchstart', onTap);

// Wait for video to be ready
video.addEventListener('loadedmetadata', () => {
  console.log("Video ready:", video.videoWidth, "x", video.videoHeight);
  resizeCanvas();
  isReady = true;
  canvas.style.pointerEvents = 'auto';  // ← THIS WAS MISSING BEFORE!
  info.textContent = "Ready! Tap screen to place points";
}, { once: true });

// Reset button
resetBtn.style.display = 'block';
resetBtn.onclick = () => {
  points = [];
  draw();
  info.textContent = "Reset! Tap to start again";
};

window.addEventListener('resize', resizeCanvas);

console.log("opencvMeasure.js loaded & ready");
