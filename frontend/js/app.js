// app.js - Full Updated Version with Multi-Point Polyline + Reset
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let referenceSpace = null;

let measurementPoints = [];
let pointMeshes = [];
let polyline = null;  // Single Line object for all points

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

 // BEST VERSION — Works perfectly on iOS & Android
let arButton;

if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
  // Customize button BEFORE creating it
  arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body },
    sessionInit: {
      // Optional: better iOS behavior
      optionalFeatures: ['dom-overlay', 'hit-test']
    }
  });

  // Now safely change text & style — works because we do it right after creation
  arButton.textContent = 'Start AR Measurement';
  arButton.style.fontSize = '18px';
  arButton.style.padding = '16px 24px';
  arButton.style.borderRadius = '12px';
  arButton.style.background = '#007AFF';
  arButton.style.color = 'white';
  arButton.style.fontWeight = 'bold';
} else {
  // Desktop fallback (no mobile styling)
  arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    domOverlay: { root: document.body }
  });
}
  document.body.appendChild(arButton);
  renderer.xr.addEventListener('sessionstart', () => {
  arButton.style.display = 'none';
});
renderer.xr.addEventListener('sessionend', () => {
  arButton.style.display = 'block';
});
  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
  scene.add(light);

  // Reticle (where you'll place points)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.8, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller for tap/select
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Reset on double tap (or add a button later)
  let lastTap = 0;
  controller.addEventListener('select', () => {
    const currentTime = Date.now();
    if (currentTime - lastTap < 400) {
      resetMeasurement();
    }
    lastTap = currentTime;
  });

  window.addEventListener('resize', onWindowResize);

  // Initial message
  document.getElementById('info').textContent = 'Point device at surface → Tap to place points';
}

function onSelect() {
  if (!reticle.visible) return;

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);

  // Add green sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  sphere.position.copy(pos);
  scene.add(sphere);
  pointMeshes.push(sphere);

  // Store point
  measurementPoints.push(pos.clone());

  // Update line and info
  updatePolyline();
  updateInfo();
}

function updatePolyline() {
  // Remove old line
  if (polyline) {
    scene.remove(polyline);
    polyline.geometry.dispose();
    polyline.material.dispose();
  }

  if (measurementPoints.length < 2) return;

  const geometry = new THREE.BufferGeometry().setFromPoints(measurementPoints);
  const material = new THREE.LineBasicMaterial({
    color: 0xffff00,
    linewidth: 4  // Note: linewidth > 1 doesn't work on all devices (WebXR limitation)
  });

  polyline = new THREE.Line(geometry, material);
  scene.add(polyline);
}

function updateInfo() {
  if (measurementPoints.length === 0) {
    document.getElementById('info').textContent = 'Tap to place points';
    return;
  }

  let total = 0;
  for (let i = 1; i < measurementPoints.length; i++) {
    total += measurementPoints[i - 1].distanceTo(measurementPoints[i]);
  }

  const segment = measurementPoints.length >= 2
    ? ` | Last: ${(measurementPoints[measurementPoints.length - 2].distanceTo(measurementPoints[measurementPoints.length - 1])).toFixed(3)} m`
    : '';

  document.getElementById('info').innerHTML = `
    <strong>Points: ${measurementPoints.length}</strong><br>
    Total Distance: <strong>${total.toFixed(3)} m</strong>${segment}<br>
    <small>Double-tap to reset</small>
  `;
}

function resetMeasurement() {
  // Remove all spheres
  pointMeshes.forEach(mesh => scene.remove(mesh));
  pointMeshes = [];

  // Remove line
  if (polyline) {
    scene.remove(polyline);
    polyline.geometry.dispose();
    polyline.material.dispose();
    polyline = null;
  }

  measurementPoints = [];
  updateInfo();
}

// Handle hit testing
function handleHitTest(frame) {
  if (!hitTestSource) return;

  const hitTestResults = frame.getHitTestResults(hitTestSource);
  console.log("Hit results:", hitTestResults.length); // Debug: Check console

  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);
    if (pose) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      // Force reticle glow for visibility
      reticle.material.emissive = new THREE.Color(0x00ff00);
    }
  } else {
    reticle.visible = false;
    console.log("No surface detected — point at flat wall/floor"); // Debug
  }
}

// XR Session Start
renderer.xr.addEventListener('sessionstart', async (event) => {
  const session = renderer.xr.getSession();
  referenceSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: referenceSpace });
  document.getElementById('info').textContent = 'AR Session started! Point at floor/wall.';
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop((timestamp, frame) => {
    if (frame) {
      handleHitTest(frame);
    }
    renderer.render(scene, camera);
  });
}
