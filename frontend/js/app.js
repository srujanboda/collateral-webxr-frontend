// app.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let localSpace = null;

let measurementPoints = [];
let pointMeshes = [];
let line = null;

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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Add AR button
  const button = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test']
  });
  document.body.appendChild(button);

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller (taps)
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  window.addEventListener('resize', onWindowResize);
  document.getElementById('info').textContent = 'Tap once to place first point.';
}

async function onSessionStart(session) {
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  localSpace = await session.requestReferenceSpace('local');
}

function onSelect() {
  if (!reticle.visible) return;

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);

  // Place a small sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  sphere.position.copy(pos);
  scene.add(sphere);

  measurementPoints.push(pos.clone());
  pointMeshes.push(sphere);

  if (measurementPoints.length === 2) {
    drawMeasurement();
  } else if (measurementPoints.length > 2) {
    resetMeasurement();
  } else {
    document.getElementById('info').textContent = 'Tap again to place second point.';
  }
}

function drawMeasurement() {
  const [p1, p2] = measurementPoints;

  // Line between points
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
  line = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(line);

  const distance = p1.distanceTo(p2);
  document.getElementById('info').textContent = `Distance: ${distance.toFixed(2)} m. Tap to reset.`;
}

function resetMeasurement() {
  // Remove old points and line
  pointMeshes.forEach(m => scene.remove(m));
  pointMeshes = [];
  measurementPoints = [];
  if (line) {
    scene.remove(line);
    line = null;
  }
  document.getElementById('info').textContent = 'Tap once to place first point.';
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  const session = renderer.xr.getSession();
  if (!session) return;

  if (!hitTestSource) {
    onSessionStart(session);
    return;
  }

  const referenceSpace = renderer.xr.getReferenceSpace();
  const hitTestResults = frame.getHitTestResults(hitTestSource);

  if (hitTestResults.length > 0) {
    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
  } else {
    reticle.visible = false;
  }

  renderer.render(scene, camera);
}
