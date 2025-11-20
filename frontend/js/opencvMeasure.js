let video = document.getElementById('videoFeed');
let canvas = document.getElementById('overlay');
let ctx = canvas.getContext('2d');
let startBtn = document.getElementById('startBtn');
let info = document.getElementById('info');

let points = [];

startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none';
  info.textContent = 'Tap on two points to measure distance';

  await startCamera();

  video.style.display = 'block';
  resizeCanvas();

  window.addEventListener('resize', resizeCanvas);

  // Enable clicking
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('click', onCanvasClick);
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (e) {
    info.textContent = 'Camera access denied ❌';
  }
}

function resizeCanvas() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function onCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  points.push({ x, y });

  draw();

  // When 2 points selected
  if (points.length === 2) {
    const dist = calcDistance(points[0], points[1]);

    info.textContent = `Distance: ${dist.toFixed(2)} m (tap again to reset)`;

    // reset for next measurement
    points = [];
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'lime';
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 3;

  // Draw dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw line if 2 points exist
  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
  }
}

function calcDistance(p1, p2) {
  // Pixel distance
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  // Convert to meters using FOV
  const approxFOV = 60; // degrees
  const width = video.videoWidth;

  const distanceToPlane = 0.5; 
  const pixelToMeter =
      (2 * distanceToPlane * Math.tan((approxFOV / 2) * Math.PI / 180)) 
      / width;

  return pixelDist * pixelToMeter;
}
