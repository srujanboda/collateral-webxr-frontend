import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null;
let session = null;

// DOM Elements
const info       = document.getElementById('info');
const arButton   = document.getElementById('arButton');
const stopButton = document.getElementById('stopButton');
const landing    = document.getElementById('landing');
const arOverlay  = document.getElementById('arOverlay');

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Bright green aiming ring
  const ringGeom = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  arButton.addEventListener('click', startARSession);
  stopButton.addEventListener('click', () => session?.end());

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startARSession() {
  if (session) {
    session.end();
    return;
  }

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    arButton.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to measure';

    await renderer.xr.setSession(session);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    session.addEventListener('end', onSessionEnded);

  } catch (e) {
    info.textContent = 'AR not supported';
    console.error(e);
  }
}

function onSessionEnded() {
  session = null;
  hitTestSource = null;
  document.body.classList.remove('ar-active');
  arButton.textContent = 'Launch AR';
  info.textContent = 'Tap to place points';
  resetAll();
}

function animate(time, frame) {
  renderer.setAnimationLoop(animate);

  if (!frame || !hitTestSource) return;

  const results = frame.getHitTestResults(hitTestSource);
  if (results.length > 0) {
    const pose = results[0].getPose(renderer.xr.getReferenceSpace());
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
  } else {
    reticle.visible = false;
  }

  // Reliable tap detection in AR
  const xrSession = renderer.xr.getSession();
  if (xrSession) {
    for (const source of xrSession.inputSources) {
      if (source.gamepad?.buttons[0]?.pressed) {
        if (reticle.visible) {
          const pos = new THREE.Vector3();
          pos.setFromMatrixPosition(reticle.matrix);
          placePoint(pos);
        }
        break;
      }
    }
  }

  renderer.render(scene, camera);
}

function placePoint(pos) {
  // Green dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Yellow lines
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

  updateMeasurements();
}

function updateMeasurements() {
  if (points.length === 0) {
    info.innerHTML = 'Tap to start measuring';
    return;
  }

  if (points.length === 1) {
    info.innerHTML = '<strong>1 point</strong><br>Tap again to measure';
    return;
  }

  let total = 0;
  let last = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].position.distanceTo(points[i-1].position);
    if (i === points.length - 1) last = d;
    total += d;
  }

  info.innerHTML = `
    <strong>${points.length} points</strong><br>
    Total <strong>${total.toFixed(3)} m</strong><br>
    Last ${last.toFixed(3)} m
  `;
}

// Double-tap to clear
let lastTap = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = [];
  lines = [];
  updateMeasurements();
}
