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
  info.textContent = 'Requesting camera access...';

  const success = await startCamera();
  if (!success) {
    info.textContent = 'Camera failed. Check console for details.';
    startBtn.style.display = 'block'; // Retry option
    return;
  }

  // Force video to play and wait for dimensions
  video.play().catch(e => {
    console.error('Video play error:', e);
    info.textContent = 'Video playback failed (autoplay blocked?).';
  });

  video.addEventListener('loadedmetadata', () => {
    console.log(`Video ready: ${video.videoWidth}x${video.videoHeight}`); // Debug log
    resizeCanvas();
    isReady = true;
    canvas.style.pointerEvents = 'auto';
    video.style.display = 'block'; // Ensure visible
    info.textContent = 'Tap screen to place points! (Console: Check logs)';
    draw();
  }, { once: true });

  // Fallback: Poll for dimensions if loadedmetadata doesn't fire (rare)
  let pollInterval = setInterval(() => {
    if (video.videoWidth > 0 && !isReady) {
      clearInterval(pollInterval);
      video.dispatchEvent(new Event('loadedmetadata'));
    }
  }, 100);

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
    console.log('Requesting camera...'); // Debug
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment', // Back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    console.log('Stream granted:', stream.getVideoTracks().length, 'tracks'); // Debug
    video.srcObject = stream;
    return true;
  } catch (e) {
    console.error('getUserMedia error:', e.name, e.message); // Always log
    let userMsg = 'Camera error: ';
    switch (e.name) {
      case 'NotAllowedError':
        userMsg += 'Permission denied. Enable in browser settings.';
        break;
      case 'NotFoundError':
        userMsg += 'No camera detected. Try mobile device.';
        break;
      case 'NotReadableError':
        userMsg += 'Camera in use by another app.';
        break;
      default:
        userMsg += e.message;
    }
    info.textContent = userMsg + ' ❌';
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
