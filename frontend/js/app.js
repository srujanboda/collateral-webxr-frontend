// js/app.js — ULTIMATE FINAL VERSION (Clean + Icon + Perfect UX)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let allChains = [];
let currentChain = null;
let heightMode = false;
let heightBasePoint = null;
let heightLine = null;
let heightLabel = null;
let currentUnit = 'm';

// Mini-Map
let miniMapVisible = true;
let miniMapCamera, miniMapScene, miniMapRenderer, miniMapCanvas;

let infoDiv, undoBtn, unitBtn, newLineBtn, resetBtn, heightBtn, miniMapBtn;

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
  infoDiv.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:white;padding:14px 36px;border-radius:22px;
    font:bold 21px system-ui;z-index:999;pointer-events:none;`;
  document.body.appendChild(infoDiv);

  // Buttons — Clean & Beautiful
  undoBtn    = createBtn('↺', 'bottom:100px;left:20px;', undoLastPoint);           // Bottom-left
  unitBtn    = createBtn('m',  'top:90px;left:20px;', toggleUnit);
  newLineBtn = createBtn('New Line', 'bottom:100px;right:20px;', startNewLine);
  resetBtn   = createBtn('Reset', 'top:20px;right:20px;', resetAll);
  miniMapBtn = createBtn('Map', 'top:20px;right:90px;', () => {
    miniMapVisible = !miniMapVisible;
    miniMapCanvas.style.display = miniMapVisible ? 'block' : 'none';
  });

  // Height Mode Button with ICON (up arrow)
  heightBtn = document.createElement('button');
  heightBtn.innerHTML = '↑';  // Beautiful height icon
  heightBtn.style.cssText = `
    position:fixed;bottom:160px;right:20px;z-index:9999;
    width:64px;height:64px;border-radius:50%;border:none;
    background:#00aa44;color:white;font-size:36px;font-weight:bold;
    box-shadow:0 8px 30px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;
  `;
  heightBtn.addEventListener('click', e => { e.stopPropagation(); toggleHeightMode(); });
  document.body.appendChild(heightBtn);

  [undoBtn, newLineBtn, resetBtn].forEach(b => b.style.display = 'none');

  // AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(arButton);

  arButton.addEventListener('click', () => {
    setTimeout(() => document.querySelectorAll('button').forEach(b => {
      if (/stop|exit/i.test(b.textContent)) b.remove();
    }), 1000);
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (reticle.visible && !heightMode) placePointFromReticle();
  });
  scene.add(controller);

  renderer.domElement.addEventListener('click', e => {
    if (e.target !== renderer.domElement) return;
    if (heightMode && heightBasePoint) {
      finishHeightMeasurement();
    } else if (reticle.visible && !heightMode) {
      placePointFromReticle();
    }
  });

  setupMiniMap();
  renderer.setAnimationLoop(render);
  startNewLine();
  updateInfo();
}

function createBtn(text, posStyle, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `
    position:fixed;z-index:9999;color:white;border:none;
    box-shadow:0 8px 30px rgba(0,0,0,0.6);font:bold 18px system-ui;
    padding:14px 24px;border-radius:18px;background:#444;
    ${posStyle}
  `;
  if (text.length <= 3) {
    b.style.width = b.style.height = '56px';
    b.style.borderRadius = '50%';
    b.style.display = 'flex';
    b.style.alignItems = 'center';
    b.style.justifyContent = 'center';
    b.style.background = text === '↺' ? '#333' : '#0066ff';
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
  if (heightMode && !heightBasePoint) {
    startHeightMeasurement(p);
  } else if (!heightMode) {
    addPoint(p);
  }
}

function addPoint(pos) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(pos);
  scene.add(dot);
  currentChain.meshes.push(dot);
  currentChain.points.push(pos.clone());
  updateCurrentChain();
  updateMiniMap();
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
  updateMiniMap();
  updateInfo();
  showButtons();
}

function startNewLine() {
  if (currentChain && currentChain.points.length >= 2) allChains.push({ ...currentChain });
  currentChain = { points: [], meshes: [], line: null, labels: [] };
  updateCurrentChain();
  updateMiniMap();
  updateInfo();
  showButtons();
}

function toggleHeightMode() {
  heightMode = !heightMode;
  heightBtn.style.background = heightMode ? '#00ff88' : '#00aa44';
  heightBtn.innerHTML = heightMode ? '✓' : '↑';  // Checkmark when active
  if (!heightMode) cancelHeightMeasurement();
  updateInfo();
}

function startHeightMeasurement(pos) {
  heightBasePoint = pos.clone();
  const baseDot = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({color:0x00ff00}));
  baseDot.position.copy(pos);
  scene.add(baseDot);
  infoDiv.innerHTML = 'Move up → Tap to finish height';
}

function finishHeightMeasurement() {
  if (!heightBasePoint || !reticle.visible) return;
  const top = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  const height = Math.abs(top.y - heightBasePoint.y);

  const lineGeom = new THREE.BufferGeometry().setFromPoints([heightBasePoint, top]);
  heightLine = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({color:0xff0088, linewidth:10}));
  scene.add(heightLine);

  heightLabel = makeLabel(formatDistance(height) + ' ↑');
  heightLabel.position.lerpVectors(heightBasePoint, top, 0.5);
  heightLabel.scale.set(0.45, 0.18, 1);
  scene.add(heightLabel);

  updateMiniMap();
  toggleHeightMode(); // auto exit
  updateInfo();
}

function cancelHeightMeasurement() {
  if (heightLine) { scene.remove(heightLine); heightLine.geometry.dispose(); }
  if (heightLabel) { scene.remove(heightLabel); heightLabel.material.map.dispose(); heightLabel.material.dispose(); }
  heightLine = heightLabel = null;
  heightBasePoint = null;
}

function updateCurrentChain() {
  if (currentChain.line) { scene.remove(currentChain.line); currentChain.line.geometry.dispose(); }
  currentChain.labels.forEach(l => { scene.remove(l); l.material.map.dispose(); l.material.dispose(); });
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
  canvas.width = 260; canvas.height = 100;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.92)'; c.fillRect(0,0,260,100);
  c.fillStyle = '#ffffff'; c.font = 'bold 52px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 130, 50);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
}

function refreshAllLabels() {
  allChains.forEach(chain => chain.labels.forEach((l, i) => {
    const d = chain.points[i].distanceTo(chain.points[i+1]);
    l.material.map.dispose();
    l.material.map = new THREE.CanvasTexture(makeLabelCanvas(formatDistance(d)));
    l.material.needsUpdate = true;
  }));
  updateCurrentChain();
}

function makeLabelCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 260; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0,0,260,100);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 52px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 130, 50);
  return c;
}

function updateInfo() {
  const pts = currentChain.points.length;
  const total = pts < 2 ? 0 : currentChain.points.reduce((s, p, i) => i === 0 ? 0 : s + p.distanceTo(currentChain.points[i-1]), 0);
  infoDiv.innerHTML = heightMode
    ? '<span style="color:#00ff88">HEIGHT MODE</span> – Tap floor → move up → tap'
    : pts < 2
      ? `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`
      : `Total: <span style="color:#ff4444;font-size:28px">${formatDistance(total)}</span> • ${pts} pts`;
}

function showButtons() {
  const has = currentChain.points.length > 0;
  undoBtn.style.display = has ? 'block' : 'none';
  resetBtn.style.display = has ? 'block' : 'none';
  newLineBtn.style.display = (currentChain.points.length >= 2) ? 'block' : 'none';
  miniMapBtn.style.display = 'block';
}

// MINI-MAP (unchanged — perfect)
function setupMiniMap() {
  const size = 180;
  miniMapCanvas = document.createElement('canvas');
  miniMapCanvas.width = size; miniMapCanvas.height = size;
  miniMapCanvas.style.cssText = `position:fixed;bottom:20px;left:20px;width:${size}px;height:${size}px;
    border:3px solid rgba(255,255,255,0.3);border-radius:50%;box-shadow:0 8px 30px rgba(0,0,0,0.6);z-index:998;`;
  document.body.appendChild(miniMapCanvas);

  miniMapRenderer = new THREE.WebGLRenderer({ canvas: miniMapCanvas, alpha: true });
  miniMapRenderer.setSize(size, size);

  miniMapCamera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50);
  miniMapCamera.position.y = 12;
  miniMapCamera.lookAt(0, 0, 0);

  miniMapScene = new THREE.Scene();
  miniMapScene.background = new THREE.Color(0x111111);
  miniMapScene.add(new THREE.GridHelper(12, 12, 0x444444, 0x222222));
}

function updateMiniMap() {
  miniMapScene.clear();
  miniMapScene.add(new THREE.GridHelper(12, 12, 0x444444, 0x222222));
  [...allChains, currentChain].forEach(chain => {
    if (chain.points.length < 2) return;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(chain.points),
      new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 4 })
    );
    miniMapScene.add(line);
  });
  if (heightLine) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      heightLine.geometry.attributes.position.array.slice(0, 3),
      heightLine.geometry.attributes.position.array.slice(3, 6)
    ].map(arr => new THREE.Vector3().fromArray(arr)));
    miniMapScene.add(new THREE.Line(geom, new THREE.LineBasicMaterial({color:0xff0088, linewidth:6})));
  }
  miniMapRenderer.render(miniMapScene, miniMapCamera);
}

function resetAll() {
  allChains.forEach(c => {
    c.meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    if (c.line) { scene.remove(c.line); c.line.geometry.dispose(); }
    c.labels.forEach(l => { scene.remove(l); l.material.map.dispose(); l.material.dispose(); });
  });
  allChains = [];
  cancelHeightMeasurement();
  startNewLine();
  updateMiniMap();
}

function render(t, frame) {
  if (!frame) return;

  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('viewer').then(rs => {
      session.requestHitTestSource({ space: rs }).then(s => hitTestSource = s);
    });
  }

  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);

      if (heightMode && heightBasePoint) {
        const top = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
        if (heightLine) scene.remove(heightLine);
        if (heightLabel) scene.remove(heightLabel);
        const geom = new THREE.BufferGeometry().setFromPoints([heightBasePoint, top]);
        heightLine = new THREE.Line(geom, new THREE.LineBasicMaterial({color:0xff0088, linewidth:10}));
        scene.add(heightLine);
        heightLabel = makeLabel(formatDistance(Math.abs(top.y - heightBasePoint.y)) + ' ↑');
        heightLabel.position.lerpVectors(heightBasePoint, top, 0.5);
        heightLabel.scale.set(0.45, 0.18, 1);
        scene.add(heightLabel);
      }
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
  if (miniMapVisible) updateMiniMap();
}
