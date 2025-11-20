// app.js - Enhanced AR Hit-Test for ANY Surface (Floors, Walls, Books, etc.)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let referenceSpace = null;

let measurementPoints = [];
let pointMeshes = [];
let polyline = null;  // Polyline for connecting all points

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

  // Enhanced AR Button for Mobile
  let arButton;
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    arButton = ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'bounded-depth'],  // Better for small objects
      domOverlay: { root: document.body },
      sessionInit: {
        optionalFeatures: ['dom-overlay', 'hit-test', 'bounded-depth']
      }
    });
    arButton.textContent = 'Start AR Measurement (Scan Surfaces)';
    arButton.style.fontSize = '18px';
    arButton.style.padding = '16px 24px';
    arButton.style.borderRadius = '12px';
    arButton.style.background = '#007AFF';
    arButton.style.color = 'white';
    arButton.style.fontWeight = 'bold';
  } else {
    arButton = ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      domOverlay: { root: document.body }
    });
  }
  document.body.appendChild(arButton);

  // Lighting (brighter for better visibility)
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
  scene.add(light);

  // Enhanced Reticle (Cursor) — Visible + Glows on ANY Hit
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      opacity: 0.8, 
      transparent: true,
      emissive: 0x004400  // Glow effect
    })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = true;  // Always show cursor, but pulse on hit
  scene.add(reticle);

  // Controller for taps
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    const currentTime = Date.now();
    if (currentTime - lastTap < 400) {
      resetMeasurement();
    }
    lastTap = currentTime;
  });

  window.addEventListener('resize', onWindowResize);

  // Scan Instructions
  document.getElementById('info').innerHTML = `
    <strong>AR Ready!</strong><br>
    Scan room (move phone slowly) to detect walls/books/tables.<br>
    Point & tap to place dot. Yellow line connects them.<br>
    <small>Double-tap to reset</small>
  `;
}

function onSelect() {
  if (!reticle.visible || measurementPoints.length > 20) return;  // Limit points

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);

  // Green sphere dot
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  sphere.position.copy(pos);
  scene.add(sphere);
  pointMeshes.push(sphere);

  measurementPoints.push(pos.clone());

  updatePolyline();
  updateInfo();

  console.log(`Placed point ${measurementPoints.length} at:`, pos);  // Debug
}

function updatePolyline() {
  if (polyline) {
    scene.remove(polyline);
    polyline.geometry.dispose();
    polyline.material.dispose();
  }

  if (measurementPoints.length < 2) return;

  const geometry = new THREE.BufferGeometry().setFromPoints(measurementPoints);
  const material = new THREE.LineBasicMaterial({
    color: 0xffff00,
    linewidth: 4
  });
  polyline = new THREE.Line(geometry, material);
  scene.add(polyline);
}

function updateInfo() {
  if (measurementPoints.length === 0) {
    document.getElementById('info').textContent = 'Point at surface & tap to place dots';
    return;
  }

  let total = 0;
  for (let i = 1; i < measurementPoints.length; i++) {
    total += measurementPoints[i - 1].distanceTo(measurementPoints[i]);
  }

  const lastSegment = measurementPoints.length >= 2
    ? ` | Last: ${measurementPoints[measurementPoints.length - 2].distanceTo(measurementPoints[measurementPoints.length - 1]).toFixed(3)} m`
    : '';

  document.getElementById('info').innerHTML = `
    <strong>Dots: ${measurementPoints.length}</strong><br>
    Total Distance: <strong>${total.toFixed(3)} m</strong>${lastSegment}<br>
    <small>Scan for walls/books | Double-tap reset</small>
  `;
}

function resetMeasurement() {
  pointMeshes.forEach(mesh => scene.remove(mesh));
  pointMeshes = [];
  if (polyline) {
    scene.remove(polyline);
    polyline.geometry.dispose();
    polyline.material.dispose();
    polyline = null;
  }
  measurementPoints = [];
  updateInfo();
}

// Enhanced Hit-Testing: ANY Surface + Debug
function handleHitTest(frame) {
  if (!hitTestSource) return;

  const hitTestResults = frame.getHitTestResults(hitTestSource);
  console.log(`Hits: ${hitTestResults.length}`);  // Debug: 0 = scan more

  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];  // Closest surface
    const pose = hit.getPose(referenceSpace);

    if (pose) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);

      // Surface type debug (from normal vector)
      const normal = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(pose.transform.matrix)).normalize();
      const upAngle = Math.acos(normal.dot(new THREE.Vector3(0, 1, 0)));  // Angle from "up"
      let surfaceType = upAngle < Math.PI / 4 ? 'Floor/Table' : upAngle > 3 * Math.PI / 4 ? 'Ceiling' : 'Wall/Object';
      console.log(`Hit ${surfaceType}! Angle: ${(upAngle * 180 / Math.PI).toFixed(0)}°`);  // Debug

      // Glow on hit
      reticle.material.emissive.setHex(0x00ff00);
    }
  } else {
    reticle.visible = true;  // Keep cursor visible, but dim
    reticle.material.emissive.setHex(0x000000);
    console.log('No hit — scan surface (move phone slowly)');
  }
}

// Session Start with Scan Prompt
renderer.xr.addEventListener('sessionstart', async (event) => {
  const session = renderer.xr.getSession();
  referenceSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: referenceSpace });
  document.getElementById('info').innerHTML += '<br><em>Scanning... Move phone to detect walls/books!</em>';
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
