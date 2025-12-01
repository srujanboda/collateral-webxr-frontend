// js/app.js - FULLY FIXED & UPGRADED VERSION

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let hitTestSourceRequested = false;

let points = [];           // All placed points (unlimited)
let pointMeshes = [];      // Visual spheres
let line = null;           // Current polyline
let distanceTexts = [];    // Floating text labels

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

  // AR Button
  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  }));

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Reticle (green ring)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.8, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller for tap
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Info text
  const info = document.createElement('div');
  info.id = 'ar-info';
  info.style.position = 'absolute';
  info.style.top = '20px';
  info.style.width = '100%';
  info.style.textAlign = 'center';
  info.style.color = 'white';
  info.style.fontSize = '20px';
  info.style.fontWeight = 'bold';
  info.style.textShadow = '0 0 10px black';
  info.style.pointerEvents = 'none';
  info.style.zIndex = '100';
  info.innerHTML = 'Point camera at floor or wall → Tap to place points';
  document.body.appendChild(info);

  window.addEventListener('resize', onWindowResize);
}

function onSelect() {
  if (!reticle.visible) return;

  const point = new THREE.Vector3();
  point.setFromMatrixPosition(reticle.matrix);

  // Add green dot
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  sphere.position.copy(point);
  scene.add(sphere);
  pointMeshes.push(sphere);

  points.push(point.clone());

  updateMeasurement();

  updateMeasurement();
}

function updateMeasurement() {
  // Remove old line and texts
  if (line) scene.remove(line);
  distanceTexts.forEach(t => scene.remove(t));
  distanceTexts = [];

  if (points.length < 2) {
    document.getElementById('ar-info').innerHTML = `Points: ${points.length} | Tap to add more`;
    return;
  }

  // Create polyline
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 4 });
  line = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(line);

  // Add distance labels between each pair
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dist = a.distanceTo(b);
    total += dist;

    // Midpoint for text
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

    // Create floating text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dist.toFixed(2) + ' m', 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    sprite.position.copy(mid);
    sprite.scale.set(0.3, 0.15, 1);
    scene.add(sprite);
    distanceTexts.push(sprite);
  }

  // Update info
  document.getElementById('ar-info').innerHTML = `
    Total: <span style="color:#ff0044">${total.toFixed(2)} m</span> 
    | Points: ${points.length} 
    | <span style="color:lime">Tap floor/wall to add</span> 
    | <a href="" style="color:red">Reset</a>
  `;

  // Reset button
  document.querySelector('#ar-info a').onclick = (e) => {
    e.preventDefault();
    points.forEach(p => {
      pointMeshes.forEach(m => scene.remove(m));
      distanceTexts.forEach(t => scene.remove(t));
    });
    points = [];
    pointMeshes = [];
    distanceTexts = [];
    if (line) scene.remove(line);
    document.getElementById('ar-info').innerHTML = 'Cleared. Tap to start again';
  };
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
  if (!frame) return;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const session = renderer.xr.getSession();

  if (session && !hitTestSourceRequested) {
    session.requestReferenceSpace('viewer').then(refSpace => {
      session.requestHitTestSource({ space: refSpace }).then(source => {
        hitTestSource = source;
      });
    });
    hitTestSourceRequested = true;

    session.addEventListener('end', () => {
      hitTestSourceRequested = false;
      hitTestSource = null;
    });
  }

  if (hitTestSource && frame) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}
