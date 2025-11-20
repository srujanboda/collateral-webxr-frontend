// js/opencvMeasure.js  ← Auto-starts camera + full measurement
console.log("opencvMeasure.js loaded");

const video = document.getElementById('videoFeed');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const resetBtn = document.getElementById('resetBtn');

let points = [];

// Auto-start camera when this file loads
(async () => {
  try {
    info.textContent = "Requesting camera...";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 } }
    });
    video.srcObject = stream;
    video.play();

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.style.pointerEvents = "auto";
      video.style.display = "block";
      info.textContent = "Ready! Tap to measure";
      draw();
    };
  } catch (err) {
    info.textContent = "Camera failed: " + err.message;
    console.error(err);
  }
})();

// Tap handler
function onTap(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches?.[0]?.clientX || e.clientX) - rect.left;
  const y = (e.touches?.[0]?.clientY || e.clientY) - rect.top;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  points.push({ x: x * scaleX, y: y * scaleY });
  draw();
}

canvas.addEventListener("touchstart", onTap, { passive: false });
canvas.addEventListener("click", onTap);

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  points.forEach(p => {
    ctx.fillStyle = "lime";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
    ctx.fill();
  });

  if (points.length > 1) {
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  // Simple distance (calibrated for ~50cm)
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    total += Math.hypot(dx, dy) * 0.0011;
  }
  info.textContent = points.length < 2 
    ? `Points: ${points.length} — Tap to add`
    : `Distance: ${total.toFixed(3)} m (${points.length} pts)`;
}

resetBtn.onclick = () => {
  points = [];
  draw();
  info.textContent = "Reset! Tap to measure again";
};

window.addEventListener("resize", () => {
  if (video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    draw();
  }
});
