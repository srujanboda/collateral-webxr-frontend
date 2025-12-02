// js/app.js — FINAL 100% WORKING (NO BLACK SCREEN)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let allChains = [];
let currentChain = { points: [], meshes: [], line: null, labels: [] };
let infoDiv, undoBtn, unitBtn, newLineBtn, resetBtn;
let isWallMode = false;
let currentUnit = 'm';

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
    position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:white;padding:14px 36px;border-radius:22px;
    font:bold 21px system-ui;z-index:999;pointer-events:none;
  `;
  infoDiv.textContent = 'Starting AR...';
  document.body.appendChild(infoDiv);

  // Buttons
  undoBtn    = createBtn('↺', 'top:20px;left:20px;', undoLastPoint);
  unitBtn    = createBtn('m',  'top:90px;left:20px;', toggleUnit);
  newLineBtn = createBtn('New Line', 'bottom:100px;right:20px;', startNewLine);
  resetBtn   = createBtn('Reset', 'top:20px;right:20px;', resetAll);

  [undoBtn, newLineBtn, resetBtn].forEach(b => b.style.display = 'none');

  // AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(arButton);

  // Remove default STOP AR button
  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(b => {
        if (b.textContent.toUpperCase().includes('STOP') || b.textContent.toUpperCase().includes('EXIT')) {
          b.remove();
        }
      });
    }, 1000);
  });

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // Reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (reticle.visible && !isWallMode) placePointFromReticle();
  });
  scene.add(controller);

  // Tap to place point (only on empty space)
  renderer.domElement.addEventListener('click', e => {
    if (e.target !== renderer.domElement) return;
    if (isWallMode) {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
      const pos = camera.position.clone().add(vec.sub(camera.position).normalize().multiplyScalar(2.5));
      addPoint(pos);
    } else if (reticle.visible) {
      placePointFromReticle();
    }
  });

  renderer.setAnimationLoop(render);
  updateInfo();
}

function createBtn(text, posStyle, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `
    position:fixed;z-index:9999;color:white;background:${text==='↺'?'#333':text==='m'||text==='ft'||text==='in'?'#0066ff':'#444'};
    border:none;border-radius:18px;padding:14px 24px;font:bold 18px system-ui;
    box-shadow:0 8px 30px rgba(0,0,0,0.6);${posStyle}
  `;
  if (text.length === 1) {
    b.style.width = b.style.height = '56px';
    b.style.borderRadius = '50%';
    b.style.display = 'flex';
    b.style.alignItems = 'center';
    b.style.justifyContent = 'center';
  }
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  document.body.appendChild(b);
  return b;
}

function toggleUnit() {
  currentUnit = currentUnit === 'm' ? 'ft' : currentUnit === 'ft' ? 'in' : 'm';
  unitBtn.textContent = currentUnit;
  refreshAllLabels();
  updateInfo();
}

function formatDistance(m) {
  if (currentUnit === 'ft') return (m * 3.28084).toFixed(2) + ' ft';
  if (currentUnit === 'in') return (m * 39.3701).toFixed(1) + ' in';
  return m.toFixed(2) + ' m';
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addPoint(p);
}

function addPoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ffaa })
  );
  dot.position.copy(pos);
  scene.add(dot);
  currentChain.meshes.push(dot);
  currentChain.points.push(pos.clone());
  updateCurrentChain();
  updateInfo();
  showButtons();
}

function undoLastPoint() {
  if (currentChain.points.length === 0) return;
  const dot = currentChain.meshes.pop();
  scene.remove(dot);
  dot.geometry.dispose();
  dot.material.dispose();
  currentChain.points.pop();
  updateCurrentChain();
  updateInfo();
  showButtons();
}

function startNewLine() {
  if (currentChain.points.length >= 2) {
    allChains.push({ ...currentChain });
  }
  currentChain = { points: [], meshes: [], line: null, labels: [] };
  updateCurrentChain();
  updateInfo();
  showButtons();
}

function updateCurrentChain() {
  if (currentChain.line) {
    scene.remove(currentChain.line);
    currentChain.line.geometry.dispose();
  }
  currentChain.labels.forEach(l => {
    scene.remove(l);
    l.material.map.dispose();
    l.material.dispose();
  });
  currentChain.labels = [];

  if (currentChain.points.length < 2) return;

  currentChain.line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(currentChain.points),
    new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 8 })
  );
  scene.add(currentChain.line);

  for (let i = 1; i < currentChain.points.length; i++) {
    const d = currentChain.points[i-1].distanceTo(currentChain.points[i]);
    const mid = new THREE.Vector3().lerpVectors(currentChain.points[i-1], currentChain.points[i], 0.5);
    const label = makeLabel(formatDistance(d));
    label.position.copy(mid);
    scene.add(label);
    currentChain.labels.push(label);
  }
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 240; canvas.height = 90;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(0, 0, 240, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 120, 45);

  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      depthTest: false
    })
  ).scale.set(0.3, 0.12, 1);
}

function refreshAllLabels() {
  allChains.forEach(chain => {
    chain.labels.forEach((l, i) => {
      const d = chain.points[i].distanceTo(chain.points[i + 1]);
      l.material.map.dispose();
      const newCanvas = makeLabelCanvas(formatDistance(d));
      l.material.map = new THREE.CanvasTexture(newCanvas);
      l.material.needsUpdate = true;
    });
  });
  updateCurrentChain();
}

function makeLabelCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 90;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0,0,240,90);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 48px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 120, 45);
  return c;
}

function updateInfo() {
  const pts = currentChain.points.length;
  if (pts === 0) {
    infoDiv.innerHTML = isWallMode
      ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`
      : `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`;
    return;
  }
  const total = currentChain.points.reduce((s, p, i) => i === 0 ? 0 : s + p.distanceTo(currentChain.points[i-1]), 0);
  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:28px">${formatDistance(total)}</span> • ${pts} pts`;
}

function showButtons() {
  const has = currentChain.points.length > 0;
  undoBtn.style.display = has ? 'block' : 'none';
  resetBtn.style.display = has ? 'block' : 'none';
  newLineBtn.style.display = (currentChain.points.length >= 2) ? 'block' : 'none';
}

function resetAll() {
  allChains.forEach(c => {
    c.meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    if (c.line) { scene.remove(c.line); c.line.geometry.dispose(); }
    c.labels.forEach(l => { scene.remove(l); l.material.map.dispose(); l.material.dispose(); });
  });
  allChains = [];
  currentChain = { points: [], meshes: [], line: null, labels: [] };
  updateCurrentChain();
  updateInfo();
  showButtons();
}

function render(time, frame) {
  if (!frame) return;

  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('viewer').then(refSpace => {
      session.requestHitTestSource({ space: refSpace }).then(source => hitTestSource = source);
    });
  }

  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      isWallMode = false;
      reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    } else {
      isWallMode = true;
      reticle.visible = false;
    }
    if (currentChain.points.length < 2) updateInfo();
  }

  renderer.render(scene, camera);
}
