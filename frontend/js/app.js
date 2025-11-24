import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, controller;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = null; // AR passthrough

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.setClearColor(0x000000, 0); // Transparent
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect); // Keep for fallback
  scene.add(controller);

  // Double-tap to reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    if (Date.now() - lastTap < 400) resetAll();
    lastTap = Date.now();
  });

  // NEW: Direct screen tap listener for mobile reliability
  renderer.domElement.addEventListener('click', onScreenTap, { passive: false });
  renderer.domElement.addEventListener('touchstart', onScreenTap, { passive: false });

  button.addEventListener('click', startAR);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startAR() {
  if (session) {
    session.end();
    return;
  }

  if (!navigator.xr) {
    info.textContent = 'WebXR not supported on this device';
    return;
  }

  try {
    console.log('Starting AR session...');
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Camera ready! Tap anywhere to place a point';

    await renderer.xr.setSession(session);
    referenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

    console.log('AR ready - taps enabled');
    session.addEventListener('end', onSessionEnd);

  } catch (error) {
    console.error('AR Error:', error);
    info.textContent = 'AR failed: ' + error.message;
  }
}

function onSessionEnd() {
  session = null;
  hitTestSource = null;
  referenceSpace = null;
  document.body.classList.remove('ar-active');
  button.textContent = 'START AR';
  info.textContent = 'Tap START AR to begin';
  resetAll();
}

// ORIGINAL controller select
function onSelect() {
  getTapPosition(); // Reuse logic
}

// NEW: Screen tap handler (fires on click/touch)
function onScreenTap(e) {
  e.preventDefault();
  if (!session) return;
  getTapPosition();
}

function getTapPosition() {
  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let position = new THREE.Vector3();

  // Hit-test
  if (hitTestSource && referenceSpace) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);
      if (pose) {
        position.setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
        console.log('Point placed at:', position.x, position.y, position.z);
      }
    }
  }

  // Fallback
  if (position.lengthSq() === 0) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    position.copy(camera.position).add(direction.multiplyScalar(0.8)); // Closer for mobile
    console.log('Fallback point at:', position.x, position.y, position.z);
  }

  placePoint(position);
}

function placePoint(position) {
  const dotGeometry = new THREE.SphereGeometry(0.02, 32, 32);
  const dotMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, 
    emissive: 0x00ff00, 
    emissiveIntensity: 1.2 
  });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.position.copy(position);
  scene.add(dot);
  points.push(dot);

  // Clear old lines
  lines.forEach(line => scene.remove(line));
  lines = [];

  // Yellow lines
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        points[i - 1].position,
        points[i].position
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
      lines.push(line);
    }
  }

  updateInfo();
}

function updateInfo() {
  if (points.length === 0) {
    info.textContent = 'Tap anywhere to place a point';
    return;
  }

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += points[i].position.distanceTo(points[i - 1].position);
  }

  let lastDistance = 0;
  if (points.length > 1) {
    lastDistance = points[points.length - 1].position.distanceTo(points[points.length - 2].position);
  }

  info.innerHTML = `
    <strong>Points: ${points.length}</strong><br>
    Total Distance: <strong>${totalDistance.toFixed(3)} m</strong><br>
    Last: <strong>${lastDistance.toFixed(3)} m</strong><br>
    <small>Double-tap to reset</small>
  `;
}

function resetAll() {
  points.forEach(point => scene.remove(point));
  lines.forEach(line => scene.remove(line));
  points = [];
  lines = [];
  if (session) updateInfo();
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    renderer.render(scene, camera);
  });
}
