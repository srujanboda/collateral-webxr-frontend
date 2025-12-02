// js/app.js — Updated for Vertical Plane Detection (Dec 2025)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let points = [], pointMeshes = [], line = null, labels = [];
let infoDiv, resetBtn, stopBtn;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Top info
  infoDiv = document.createElement('div');
  infoDiv.style.cssText = `
    position:fixed; top:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.75); color:white; padding:10px 24px;
    border-radius:16px; font:bold 19px system-ui; z-index:999; pointer-events:none;
  `;
  infoDiv.textContent = "Move phone → look for green ring → tap to place point";
  document.body.appendChild(infoDiv);

  // Reset Button — Bottom Left
  resetBtn = document.createElement('button');
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = `
    position:fixed; bottom:30px; left:20px;
    padding:14px 28px; font-size:17px; font-weight:bold;
    background:#ff3333; color:white; border:none; border-radius:14px;
    box-shadow:0 8px 25px rgba(0,0,0,0.5); z-index:999; display:none;
  `;
  resetBtn.onclick = resetAll;
  document.body.appendChild(resetBtn);

  // Stop AR Button — Bottom Right
  stopBtn = document.createElement('button');
  stopBtn.textContent = "Stop AR";
  stopBtn.style.cssText = `
    position:fixed; bottom:30px; right:20px;
    padding:14px 28px; font-size:17px; font-weight:bold;
    background:#333; color:white; border:none; border-radius:14px;
    box-shadow:0 8px 25px rgba(0,0,0,0.5); z-index:999;
  `;
  stopBtn.onclick = () => renderer.xr.getSession()?.end();
  document.body.appendChild(stopBtn);

  // START AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  arButton.classList.add('custom-ar-button');
  document.body.appendChild(arButton);

  // Remove default Three.js buttons
  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent.toUpperCase();
        if (btn !== resetBtn && btn !== stopBtn && btn !== arButton &&
            (text.includes('STOP') || text.includes('EXIT') || text.includes('END'))) {
          btn.remove();
        }
      });
    }, 800);
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  renderer.setAnimationLoop(render);
}

function onSelect() {
  if (!reticle.visible) return;
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(p);
  scene.add(dot);
  pointMeshes.push(dot);
  points.push(p.clone());
  updateAll();
}

function updateAll() {
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = [];

  if (points.length < 2) {
    infoDiv.textContent = "Tap when green ring appears";
    resetBtn.style.display = "none";
    return;
  }

  resetBtn.style.display = "block";

  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:0xff0044, linewidth:6}));
  scene.add(line);

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i-1].distanceTo(points[i]);
    total += d;

    const mid = new THREE.Vector3().lerpVectors(points[i-1], points[i], 0.5);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 160; canvas.height = 60;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0,0,160,60);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 38px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.toFixed(2)+' m', 80, 30);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas), depthTest:false}));
    sprite.position.copy(mid);
    sprite.scale.set(0.20, 0.08, 1);
    scene.add(sprite);
    labels.push(sprite);
  }

  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:23px">${total.toFixed(2)} m</span> • ${points.length} pts`;
}

function resetAll() {
  points = [];
  pointMeshes.forEach(m => scene.remove(m));
  pointMeshes = [];
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = []; line = null;
  infoDiv.textContent = "Cleared — ready to measure again";
  resetBtn.style.display = "none";
}

function render(t, frame) {
  if (!frame) return;
  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('local').then(refSpace => {
      session.requestHitTestSource({ space: refSpace }).then(source => {
        hitTestSource = source;
      });
    });
  }
  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const hit = hits[0].getPose(renderer.xr.getReferenceSpace());
      const normal = new THREE.Vector3();
      const position = new THREE.Vector3().setFromMatrixPosition(hit.transform.matrix);
      normal.setFromMatrixColumn(hit.transform.matrix, 2).normalize(); // Extract normal from transform matrix

      // Check if surface is near-vertical (e.g., wall)
      const angleWithVertical = Math.abs(normal.angleTo(new THREE.Vector3(0, 1, 0)) * (180 / Math.PI));
      reticle.visible = true; // Show reticle on any detected plane
      if (angleWithVertical > 45 && angleWithVertical < 135) {
        reticle.material.color.setHex(0x00ff00); // Green for vertical surfaces
      } else {
        reticle.material.color.setHex(0x0000ff); // Blue for horizontal surfaces
      }
      reticle.matrix.fromArray(hit.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
}
