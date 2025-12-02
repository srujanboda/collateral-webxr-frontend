// js/app.js — FINAL: Multiple Independent Lines + Everything Else Perfect

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;

// All measurements are stored in this array of "chains"
let allChains = [];        // Each chain = { points: [], meshes: [], line: null, labels: [], total: 0 }
let currentChain = null;   // The chain being edited right now

let infoDiv, resetBtn, undoBtn, unitBtn, newLineBtn;
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

  // Top info
  infoDiv = document.createElement('div');
  infoDiv.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:white;padding:12px 32px;border-radius:20px;
    font:bold 20px system-ui;z-index:999;pointer-events:none;`;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 m</span> • 0 pts`;
  document.body.appendChild(infoDiv);

  // Buttons
  undoBtn = createButton('↺', 'top:20px;left:20px;', () => undoLastPoint());
  unitBtn = createButton('m', 'top:90px;left:20px;background:#0066ff;', () => toggleUnit());
  newLineBtn = createButton('New Line', 'top:20px;right:130px;background:#444;', () => startNewLine());
  resetBtn = createButton('Reset', 'top:20px;right:20px;background:#ff3333;', () => resetAll());

  // Hide controls until first point
  [undoBtn, newLineBtn, resetBtn].forEach(b => b.style.display = 'none');

  // START AR
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(arButton);

  arButton.addEventListener('click', () => {
    setTimeout(() => document.querySelectorAll('button').forEach(b => {
      if (b.textContent.toUpperCase().includes('STOP') || b.textContent.toUpperCase().includes('EXIT')) b.remove();
    }), 800);
  });

  // Camera + OpenCV
  video = document.createElement('video');
  video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;z-index:-1;';
  video.autoplay = video.playsInline = video.muted = true;
  document.body.appendChild(video);

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;z-index:998;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { video.srcObject = s; video.play(); }).catch(() => {});

  if (typeof cv !== 'undefined') onOpenCVReady();
  window.onOpenCVReady = () => startWallDetection();

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

  renderer.domElement.addEventListener('click', e => { if (e.target === renderer.domElement) onScreenTap(e); });
  renderer.setAnimationLoop(render);

  // Start first chain
  startNewLine();
}

// Helper to create buttons with stopPropagation
function createButton(text, style, onclick) {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `position:fixed;z-index:9999;padding:12px 24px;border:none;border-radius:14px;color:white;font:bold 16px system-ui;box-shadow:0 6px 20px rgba(0,0,0,0.5);${style}`;
  if (text === '↺') btn.style.cssText += 'width:56px;height:56px;border-radius:50%;font-size:28px;background:#333;';
  if (text === 'm') btn.style.cssText += 'width:56px;height:56px;border-radius:50%;background:#0066ff;display:flex;align-items:center;justify-content:center;';
  btn.addEventListener('click', e => { e.stopPropagation(); onclick(); });
  document.body.appendChild(btn);
  return btn;
}

function toggleUnit() {
  if (currentUnit === 'm') currentUnit = 'ft';
  else if (currentUnit === 'ft') currentUnit = 'in';
  else currentUnit = 'm';
  unitBtn.textContent = currentUnit;
  updateAllLabels();
}

function formatDistance(m) {
  if (currentUnit === 'ft') return (m * 3.28084).toFixed(2) + ' ft';
  if (currentUnit === 'in') return (m * 39.3701).toFixed(1) + ' in';
  return m.toFixed(2) + ' m';
}

function onSelect() { if (reticle.visible && !isWallMode) placePointFromReticle(); }

function onScreenTap(e) {
  if (!isWallMode || currentChain.points.length >= 20) return;
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
  const pos = camera.position.clone().add(vec.sub(camera.position).normalize().multiplyScalar(2.5));
  addPointToCurrentChain(pos);
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addPointToCurrentChain(p);
}

function addPointToCurrentChain(pos) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(pos);
  scene.add(dot);
  currentChain.meshes.push(dot);
  currentChain.points.push(pos.clone());
  updateCurrentChain();
  updateTopInfo();
  showControls();
}

function undoLastPoint() {
  if (currentChain.points.length === 0) return;
  scene.remove(currentChain.meshes.pop());
  currentChain.points.pop();
  updateCurrentChain();
  updateTopInfo();
  showControls();
}

function startNewLine() {
  // Save current chain if it has at least 2 points
  if (currentChain && currentChain.points.length >= 2) {
    allChains.push({...currentChain});
  }
  // Start fresh chain
  currentChain = { points: [], meshes: [], line: null, labels: [], total: 0 };
  updateTopInfo();
  showControls();
}

function updateCurrentChain() {
  // Remove old line & labels
  if (currentChain.line) scene.remove(currentChain.line);
  currentChain.labels.forEach(l => scene.remove(l));
  currentChain.labels = [];

  if (currentChain.points.length < 2) return;

  currentChain.line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(currentChain.points),
    new THREE.LineBasicMaterial({color:0xff0044, linewidth:6})
  );
  scene.add(currentChain.line);

  let total = 0;
  for (let i = 1; i < currentChain.points.length; i++) {
    const d = currentChain.points[i-1].distanceTo(currentChain.points[i]);
    total += d;
    const mid = new THREE.Vector3().lerpVectors(currentChain.points[i-1], currentChain.points[i], 0.5);
    const sprite = createLabelSprite(formatDistance(d));
    sprite.position.copy(mid);
    scene.add(sprite);
    currentChain.labels.push(sprite);
  }
  currentChain.total = total;
}

function updateAllLabels() {
  allChains.forEach(chain => {
    chain.labels.forEach(l => l.material.map.dispose());
    chain.labels.forEach((l, i) => {
      const d = chain.points[i].distanceTo(chain.points[i+1]);
      l.material.map = new THREE.CanvasTexture(createLabelCanvas(formatDistance(d)));
      l.material.needsUpdate = true;
    });
  });
  if (currentChain) updateCurrentChain();
  updateTopInfo();
}

function createLabelCanvas(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 70;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0,0,200,70);
  c.fillStyle = 'white'; c.font = 'bold 42px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 100, 35);
  return canvas;
}

function createLabelSprite(text) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(createLabelCanvas(text)),
    depthTest: false
  })).scale.set(0.25, 0.1, 1);
}

function updateTopInfo() {
  const total = currentChain ? currentChain.total : 0;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:26px">${formatDistance(total)}</span> • ${currentChain.points.length} pts`;
}

function showControls() {
  const hasPoints = currentChain.points.length > 0;
  undoBtn.style.display = hasPoints ? 'block' : 'none';
  resetBtn.style.display = hasPoints ? 'block' : 'none';
  newLineBtn.style.display = (currentChain.points.length >= 2) ? 'block' : 'none';
}

function resetAll() {
  allChains.forEach(chain => {
    chain.meshes.forEach(m => scene.remove(m));
    if (chain.line) scene.remove(chain.line);
    chain.labels.forEach(l => scene.remove(l));
  });
  allChains = [];
  startNewLine();
}

function startWallDetection() {
  let running = false;
  const process = () => {
    if (running || !isWallMode || video.videoWidth === 0) { requestAnimationFrame(process); return; }
    running = true;
    const frame = cv.imread(video);
    const gray = new cv.Mat(); cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    const corners = new cv.KeyPointVector();
    cv.FAST(gray, corners, 30, true);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i = 0; i < corners.size(); i++) {
      const pt = corners.get(i).pt;
      ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2); ctx.fill();
    }
    frame.delete(); gray.delete(); corners.delete();
    running = false;
    requestAnimationFrame(process);
  };
  process();
}

function render(t, frame) {
  if (!frame) return;
  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('viewer').then(rs => {
      session.requestHitTestSource({space: rs}).then(s => hitTestSource = s);
    });
  }
  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      isWallMode = false; canvas.style.opacity = '0'; reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    } else {
      isWallMode = true; canvas.style.opacity = '0.6'; reticle.visible = false;
      if (currentChain.points.length < 2) {
        infoDiv.innerHTML = `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`;
      }
    }
  }
  renderer.render(scene, camera);
}
