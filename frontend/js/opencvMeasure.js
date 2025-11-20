let video = document.getElementById('videoFeed');
let canvas = document.getElementById('overlay');
let ctx = canvas.getContext('2d');
let startBtn = document.getElementById('startBtn');
let resetBtn = document.getElementById('resetBtn');
let info = document.getElementById('info');

let points = [];
let isReady = false; // Flag for video ready

startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none';
  info.textContent = 'Tap on points to measure (connect with line). Use Reset to clear.';

  const success = await startCamera();
  if (!success) return;

  // Wait for video to load dimensions
  video.addEventListener('loadedmetadata', () => {
    resizeCanvas();
    isReady = true;
    canvas.style.pointerEvents = 'auto'; // Enable clicks now
    info.textContent += ' Ready! Tap screen.';
    draw(); // Initial clear
  }, { once: true });

  video.style.display = 'block';
  window.addEventListener('resize', resizeCanvas);

  resetBtn.style.display = 'block';
  resetBtn.addEventListener('click', () => {
    points = [];
    draw();
    info.textContent = 'Cleared. Tap to add points.';
  });
});

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment', // Prefer back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    video.srcObject = stream;
    return true;
  } catch (e) {
    console.error('Camera error:', e);
    info.textContent = 'Camera access denied ❌. Check permissions.';
    startBtn.style.display = 'block'; // Show button again
    return false;
  }
}

function resizeCanvas() {
  if (!video.videoWidth) return; // Safety check
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  draw(); // Redraw on resize
}

function onCanvasClick(event) {
  if (!isReady) return;

  // Handle both mouse and touch (prevent double-firing)
  event.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX || (event.touches?.[0]?.clientX);
  const clientY = event.clientY || (event.touches?.[0]?.clientY);
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  // Scale to canvas coords (for high-DPI)
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  points.push({ x: x * scaleX, y: y * scaleY });

  draw();
  updateInfo();
}

// Touch support (fallback if click fails)
canvas.addEventListener('touchstart', onCanvasClick, { passive: false });

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'lime';
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 3;

  // Draw all dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw polyline connecting ALL points
  if (points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }
}

function updateInfo() {
  if (points.length === 0) {
    info.textContent = 'Tap on points to measure (connect with line).';
    return;
  }

  let totalDist = 0;
  for (let i = 1; i < points.length; i++) {
    totalDist += calcDistance(points[i-1], points[i]);
  }

  info.textContent = `Points: ${points.length} | Total Distance: ${totalDist.toFixed(2)} m`;
}

function calcDistance(p1, p2) {
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const approxFOV = 60; // Tune to your camera's horizontal FOV
  const width = video.videoWidth;
  const distanceToPlane = 0.5; // Assumed depth; adjust for accuracy
  const pixelToMeter = (2 * distanceToPlane * Math.tan((approxFOV / 2) * Math.PI / 180)) / width;
  return pixelDist * pixelToMeter;
}
