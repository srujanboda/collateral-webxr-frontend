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
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('click', onCanvasClick);
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (e) {
    info.textContent = 'Camera access denied';
    console.error(e);
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

  if (points.length === 2) {
    const dist = calcDistance(points[0], points[1]);
    info.textContent = `Approx distance: ${dist.toFixed(2)} m (tap again to reset)`;
    points = [];
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'lime';
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 2;

  points.forEach(p => ctx.beginPath() || ctx.arc(p.x, p.y, 6, 0, Math.PI * 2) || ctx.fill());

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
  }
}

function calcDistance(p1, p2) {
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const approxFOV = 60; // degrees
  const width = video.videoWidth;
  const distanceToPlane = 0.5; // assume 0.5m from camera to object
  const pixelToMeter = (2 * distanceToPlane * Math.tan((approxFOV / 2) * Math.PI / 180)) / width;
  return pixelDist * pixelToMeter;
}
