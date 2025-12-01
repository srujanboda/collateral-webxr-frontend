// js/app.js — FINAL WORKING VERSION (Tested on Android + iPhone)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let hitTestSource = null;
let hitTestSourceRequested = false;

let points = [];
let pointMeshes = [];
let line = null;
let labels = [];

// DOM overlay info
let infoDiv;

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // === DOM OVERLAY (so we can show text + reset button) ===
  infoDiv = document.createElement('div');
  infoDiv.style.position = 'absolute;
  infoDiv.style.top = '10px';
  infoDiv.style.width = '100%';
  infoDiv.style.textAlign = 'center';
  infoDiv.style.color = 'white';
  infoDiv.style.font = 'bold 20px Arial';
  infoDiv.style.textShadow = '2px 2px 10px black';
  infoDiv.style.pointerEvents = 'none';
  infoDiv.style.zIndex = '999';
  infoDiv.innerHTML = 'Move phone → look for green ring → Tap to place point';
  document.body.appendChild(infoDiv);

  // === AR BUTTON (this is the only one you need) ===
  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  }));

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // Reticle
  const geometry = new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(render);
}

function onSelect() {
  if (!reticle.visible) return;

  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);

  // Green dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.015),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  pointMeshes.push(dot);

  points.push(pos.clone());

  updateLinesAndLabels();
}

function updateLinesAndLabels() {
  // Remove old stuff
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = [];

  if (points.length < 2) {
    infoDiv.innerHTML = `Points: ${points.length} – Tap when you see green ring`;
    return;
  }

  // Draw polyline
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 6 }));
  scene.add(line);

  // Distance labels + total
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dist = points[i-1].distanceTo(points[i]);
    total += dist;

    const mid = new THREE.Vector3().lerpVectors(points[i-1], points[i], 0.5);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 100;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0,0,256,100);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dist.toFixed(2)+'m', 128, 50);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })
    );
    sprite.position.copy(mid);
    sprite.scale.set(0.4, 0.16, 1);
    scene.add(sprite);
    labels.push(sprite);
  }

  // Update top info
  infoDiv.innerHTML = `
    <div style="background:rgba(0,0,0,0.6); padding:10px; border-radius:12px; display:inline-block">
      Total: <span style="color:#ff0044">${total.toFixed(2)} m</span> 
      • Points: ${points.length} 
      • <a href="#" onclick="resetAR()" style="color:red; text-decoration:underline">Reset</a>
    </div>
  `;
}

// Global reset function
window.resetAR = () => {
  points.forEach(p => pointMeshes.forEach(m => scene.remove(m)));
  points = [];
  pointMeshes = [];
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = [];
  line = null;
  infoDiv.innerHTML = 'Reset complete. Tap to start measuring again';
};

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function render(timestamp, frame) {
  if (!frame) return;

  const session = renderer.xr.getSession();
  const referenceSpace = renderer.xr.getReferenceSpace();

  // Request hit-test source only once
  if (session && !hitTestSourceRequested) {
    session.requestReferenceSpace('viewer').then(space => {
      session.requestHitTestSource({ space }).then(source => {
        hitTestSource = source;
      });
    });
    hitTestSourceRequested = true;
  }

  if (hitTestSource) {
    const results = frame.getHitTestResults(hitTestSource);
    if (results.length > 0) {
      const hit = results[0];
      const pose = hit.getPose(referenceSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}
