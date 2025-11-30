import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null;
let session = null;
let latestHitPose = null;  // Track for select event

const info = document.getElementById('info');
const arButton = document.getElementById('arButton');
const stopButton = document.getElementById('stopButton');

init();
animate();  // Note: animate() now uses renderer.setAnimationLoop

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Reticle setup (unchanged)
  const ringGeom = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  arButton.addEventListener('click', startAR);
  stopButton.addEventListener('click', () => session?.end());

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startAR() {
  if (session) return;

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    info.textContent = 'Point at surface, then tap to place points';
    renderer.xr.setSession(session);

    // NEW: Add select event listener for taps
    session.addEventListener('select', onSelect);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    const localSpace = await session.requestReferenceSpace('local');  // For pose reference
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    session.addEventListener('end', onSessionEnd);
    console.log('✅ AR session started with hit-test');

  } catch (e) {
    console.warn('DOM overlay failed, retrying without:', e);
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test']
      });
      // ... (repeat setup without domOverlay)
      session.addEventListener('select', onSelect);
      // ... (rest as above)
    } catch (e2) {
      console.error('AR init failed:', e2);
      info.textContent = 'AR unavailable—try Chrome on Android or fallback mode';
      // Optionally trigger 2D fallback here
    }
  }
}

// NEW: Touch/tap handler
function onSelect(event) {
  if (reticle.visible && latestHitPose) {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(reticle.matrix);  // Or use latestHitPose.transform.position
    placePoint(pos);
    console.log('🟢 Point placed at:', pos);
  } else {
    console.log('❌ No valid hit for placement');
  }
}

function animate(time, frame) {
  if (!frame || !session || !hitTestSource) return;

  const hitTestResults = frame.getHitTestResults(hitTestSource);
  if (hitTestResults.length > 0) {
    latestHitPose = hitTestResults[0].getPose(renderer.xr.getReferenceSpace());
    if (latestHitPose) {
      reticle.visible = true;
      reticle.matrix.fromArray(latestHitPose.transform.matrix);
    }
  } else {
    reticle.visible = false;
    latestHitPose = null;
  }

  // REMOVED: Polling loop for buttons

  renderer.render(scene, camera);
}

function placePoint(pos) {
  // (Unchanged: Create sphere, add to scene, draw lines)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Clear and redraw lines
  lines.forEach(l => scene.remove(l));
  lines = [];
  for (let i = 1; i < points.length; i++) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      points[i-1].position, points[i].position
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 }));
    scene.add(line);
    lines.push(line);
  }
  updateInfo();
}

function updateInfo() {
  // (Unchanged)
  if (points.length === 0) {
    info.innerHTML = 'Tap to place point';
    return;
  }
  if (points.length === 1) {
    info.innerHTML = '<strong>1 point</strong>';
    return;
  }
  let total = 0, last = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].position.distanceTo(points[i-1].position);
    if (i === points.length - 1) last = d;
    total += d;
  }
  info.innerHTML = `
    <strong>${points.length} pts</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last.toFixed(3)} m
  `;
}

function onSessionEnd() {
  session = null;
  hitTestSource?.release();
  document.body.classList.remove('ar-active');
  info.textContent = 'Session ended—tap Launch AR to restart';
  resetAll();
}

function resetAll() {
  // (Unchanged, but add touchend for double-tap reset if desired)
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  updateInfo();
}

// For double-tap reset (optional, from your original)
let lastTap = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});
