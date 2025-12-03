// js/app.js — FINAL PERFECT VERSION (Smaller buttons + Undo at bottom-right)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let allChains = []; // All finished measurements
let currentChain = null; // Current active measurement
let infoDiv, undoBtn, unitBtn, newLineBtn, resetBtn;
let isWallMode = false;
let currentUnit = 'm';
let video, canvas, ctx;

init();

async function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Top info bar
  infoDiv = document.createElement('div');
  infoDiv.style.cssText = `
    position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:white;padding:12px 32px;border-radius:20px;
    font:bold 20px system-ui;z-index:999;pointer-events:none;
  `;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 m</span> • 0 pts`;
  document.body.appendChild(infoDiv);

  // SMALLER BUTTONS
  undoBtn = createBtn('↺', 'bottom:100px;right:20px;width:48px;height:48px;border-radius:50%;background:#333;font-size:24px;', undoLastPoint);
  unitBtn = createBtn('m', 'top:90px;left:20px;width:48px;height:48px;border-radius:50%;background:#0066ff;', toggleUnit);
  newLineBtn = createBtn('New Line', 'top:20px;right:130px;background:#444;padding:10px 18px;font-size:14px;', startNewLine);
  resetBtn = createBtn('Reset', 'top:20px;right:20px;background:#ff3333;padding:10px 18px;font-size:14px;', resetAll);

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
        if (/stop|exit/i.test(b.textContent)) b.remove();
      });
    }, 1000);
  });

  // Video + OpenCV canvas (for wall corners)
  video = document.createElement('video');
  video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;z-index:-1;';
  video.autoplay = video.muted = video.playsInline = true;
  document.body.appendChild(video);
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;z-index:998;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { video.srcObject = s; video.play(); })
    .catch(() => {});

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Only trigger tap on empty space
  renderer.domElement.addEventListener('click', e => {
    if (e.target === renderer.domElement) onScreenTap(e);
  });

  renderer.setAnimationLoop(render);
  startNewLine();
}

// Helper
function createBtn(text, style, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `position:fixed;z-index:9999;color:white;font:bold 16px system-ui;padding:12px 20px;border:none;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,0.5);${style}`;
  if (text === 'm' || text === 'ft' || text === 'in') {
    b.style.cssText += 'display:flex;align-items:center;justify-content:center;';
  }
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  document.body.appendChild(b);
  return b;
}

function toggleUnit() {
  if (currentUnit === 'm') currentUnit = 'ft';
  else if (currentUnit === 'ft') currentUnit = 'in';
  else currentUnit = 'm';
  unitBtn.textContent = currentUnit;
  refreshAllLabels();
}

function formatDistance(m) {
  if (currentUnit === 'ft') return (m * 3.28084).toFixed(2) + ' ft';
  if (currentUnit === 'in') return (m * 39.3701).toFixed(1) + ' in';
  return m.toFixed(2) + ' m';
}

function onSelect() {
  if (reticle.visible && !isWallMode) placePointFromReticle();
}

function onScreenTap(e) {
  if (!isWallMode) return;
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
  const pos = camera.position.clone().add(vec.sub(camera.position).normalize().multiplyScalar(2.5));
  addPoint(pos);
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addPoint(p);
}

function addPoint(pos) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
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
  scene.remove(currentChain.meshes.pop());
  currentChain.points.pop();
  updateCurrentChain();
  updateInfo();
  showButtons();
}

function startNewLine() {
  if (currentChain && currentChain.points.length >= 2) {
    allChains.push(currentChain);
  }
  currentChain = { points: [], meshes: [], line: null, labels: [] };
  updateInfo();
  showButtons();
}

function updateCurrentChain() {
  if (currentChain.line) scene.remove(currentChain.line);
  currentChain.labels.forEach(l => scene.remove(l));
  currentChain.labels = [];
  if (currentChain.points.length < 2) return;
  currentChain.line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(currentChain.points),
    new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 6 })
  );
  scene.add(currentChain.line);
  for (let i = 1; i < currentChain.points.length; i++) {
    const dist = currentChain.points[i-1].distanceTo(currentChain.points[i]);
    const mid = new THREE.Vector3().lerpVectors(currentChain.points[i-1], currentChain.points[i], 0.5);
    const sprite = makeLabel(formatDistance(dist));
    sprite.position.copy(mid);
    scene.add(sprite);
    currentChain.labels.push(sprite);
  }
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 220; canvas.height = 80;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.9)';
  c.fillRect(0,0,220,80);
  c.fillStyle = '#fff';
  c.font = 'bold 46px system-ui';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 110, 40);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })
  );
  sprite.scale.set(0.28, 0.11, 1);
  return sprite;
}

function refreshAllLabels() {
  allChains.forEach(chain => {
    chain.labels.forEach((spr, i) => {
      const d = chain.points[i].distanceTo(chain.points[i+1]);
      spr.material.map.dispose();
      spr.material.map = new THREE.CanvasTexture(makeLabelCanvas(formatDistance(d)));
      spr.material.needsUpdate = true;
    });
  });
  updateCurrentChain();
  updateInfo();
}

function makeLabelCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 220; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,220,80);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 46px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 110, 40);
  return c;
}

function updateInfo() {
  const pts = currentChain.points.length;
  const total = currentChain.points.length < 2 ? 0 :
    currentChain.points.reduce((sum, p, i) => i === 0 ? 0 : sum + p.distanceTo(currentChain.points[i-1]), 0);
  infoDiv.innerHTML = pts < 2
    ? (isWallMode ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere` : `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`)
    : `Total: <span style="color:#ff4444;font-size:26px">${formatDistance(total)}</span> • ${pts} pts`;
}

function showButtons() {
  const has = currentChain.points.length > 0;
  undoBtn.style.display = has ? 'block' : 'none';
  resetBtn.style.display = has ? 'block' : 'none';
  newLineBtn.style.display = (currentChain.points.length >= 2) ? 'block' : 'none';
}

function resetAll() {
  allChains.forEach(c => {
    c.meshes.forEach(m => scene.remove(m));
    if (c.line) scene.remove(c.line);
    c.labels.forEach(l => scene.remove(l));
  });
  allChains = [];
  startNewLine();
}

function render(t, frame) {
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
      canvas.style.opacity = '0';
      reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
      if (currentChain.points.length < 2) {
        infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`;
      }
    } else {
      isWallMode = true;
      canvas.style.opacity = '0.6';
      reticle.visible = false;
      if (currentChain.points.length < 2) {
        infoDiv.innerHTML = `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`;
      }
    }
  }
  renderer.render(scene, camera);
}
