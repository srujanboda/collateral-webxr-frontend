import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null;
let session = null;

const info       = document.getElementById('info');
const arButton   = document.getElementById('arButton');
const stopButton = document.getElementById('stopButton');

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const ringGeom = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  arButton.addEventListener('click', startAR);
  stopButton.addEventListener('click', () => session?.end());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

async function startAR() {
  if (session) return;

  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      info.textContent = 'AR not supported on this device';
      return;
    }

    // Only request dom-overlay if it's actually available
    const optionalFeatures = [];
    const domOverlaySupported = await navigator.xr.isSessionSupported('immersive-ar')
      .then(() => navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['dom-overlay'] })
      .then(() => true).catch(() => false));

    if (domOverlaySupported) optionalFeatures.push('dom-overlay');

    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: optionalFeatures,
      domOverlay: optionalFeatures.includes('dom-overlay') ? { root: document.body } : undefined
    });

    document.body.classList.add('ar-active');
    info.textContent = 'Tap to place points';

    await renderer.xr.setSession(session);

    const refSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: refSpace });

    session.addEventListener('end', () => {
      session = null;
      hitTestSource = null;
      document.body.classList.remove('ar-active');
      info.textContent = 'Tap Launch AR to begin';
      resetAll();
    });

  } catch (e) {
    console.error('AR Error:', e);
    info.textContent = 'AR failed – try Chrome latest version';
  }
}

function animate(time, frame) {
  renderer.setAnimationLoop(animate);

  if (!frame || !session || !hitTestSource) return;

  const results = frame.getHitTestResults(hitTestSource);
  if (results.length > 0) {
    const pose = results[0].getPose(renderer.xr.getReferenceSpace());
    if (pose) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    }
  } else {
    reticle.visible = false;
  }

  // Tap detection – works on ALL Android phones
  for (const source of session.inputSources) {
    if (source.gamepad?.buttons[0]?.pressed) {
      if (reticle.visible) {
        const pos = new THREE.Vector3();
        pos.setFromMatrixPosition(reticle.matrix);
        placePoint(pos);
      }
      break;
    }
  }

  renderer.render(scene, camera);
}

// — rest of functions unchanged (placePoint, updateInfo, resetAll, double-tap) —
function placePoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  lines.forEach(l => scene.remove(l));
  lines = [];

  for (let i = 1; i < points.length; i++) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]),
      new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 })
    );
    scene.add(line);
    lines.push(line);
  }
  updateInfo();
}

function updateInfo() {
  if (points.length === 0) {
    info.innerHTML = 'Tap to place point';
    return;
  }
  if (points.length === 1) {
    info.innerHTML = '<strong>1 point</strong><br>Tap again to measure';
    return;
  }

  let total = 0, last = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].position.distanceTo(points[i-1].position);
    if (i === points.length-1) last = d;
    total += d;
  }

  info.innerHTML = `
    <strong>${points.length} pts</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last.toFixed(3)} m
  `;
}

let lastTap = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  updateInfo();
}
