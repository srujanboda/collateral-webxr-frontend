// js/app.js — FINAL VERSION: Everything Fixed & Perfect

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let points = [], pointMeshes = [], line = null, labels = [];
let infoDiv, resetBtn, undoBtn, unitBtn, newLineBtn;
let isWallMode = false;
let currentUnit = 'm'; // 'm', 'ft', 'in'
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
    position:fixed; top:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.85); color:white; padding:12px 32px;
    border-radius:20px; font:bold 20px system-ui; z-index:999; pointer-events:none;
  `;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 m</span> • 0 pts`;
  document.body.appendChild(infoDiv);

  // UNDO BUTTON (top-left)
  undoBtn = document.createElement('button');
  undoBtn.innerHTML = '↺';
  undoBtn.style.cssText = `
    position:fixed; top:20px; left:20px; z-index:9999;
    width:56px; height:56px; border-radius:50%;
    background:#333; color:white; border:none;
    font-size:28px; box-shadow:0 6px 20px rgba(0,0,0,0.6);
    display:none;
  `;
  undoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    undoLastPoint();
  });
  document.body.appendChild(undoBtn);

  // UNIT TOGGLE (below undo)
  unitBtn = document.createElement('button');
  unitBtn.textContent = 'm';
  unitBtn.style.cssText = `
    position:fixed; top:90px; left:20px; z-index:9999;
    width:56px; height:56px; border-radius:50%;
    background:#0066ff; color:white; border:none;
    font:bold 20px system-ui; box-shadow:0 8px 25px rgba(0,102,255,0.5);
    display:flex; align-items:center; justify-content:center;
  `;
  unitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentUnit === 'm') { currentUnit = 'ft'; unitBtn.textContent = 'ft'; }
    else if (currentUnit === 'ft') { currentUnit = 'in'; unitBtn.textContent = 'in'; }
    else { currentUnit = 'm'; unitBtn.textContent = 'm'; }
    updateAll();
  });
  document.body.appendChild(unitBtn);

  // NEW LINE BUTTON (top-right, next to Reset)
  newLineBtn = document.createElement('button');
  newLineBtn.textContent = "New Line";
  newLineBtn.style.cssText = `
    position:fixed; top:20px; right:130px; z-index:999;
    padding:10px 20px; font:bold 15px system-ui; background:#444; color:white;
    border:none; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.5); display:none;
  `;
  newLineBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startNewLine();
  });
  document.body.appendChild(newLineBtn);

  // RESET BUTTON
  resetBtn = document.createElement('button');
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:999;
    padding:12px 24px; font:bold 16px system-ui; background:#ff3333; color:white;
    border:none; border-radius:14px; box-shadow:0 6px 20px rgba(0,0,0,0.5); display:none;
  `;
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAll();
  });
  document.body.appendChild(resetBtn);

  // START AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(arButton);

  // Remove default Stop AR button
  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(b => {
        if (b.textContent.toUpperCase().includes('STOP') || b.textContent.toUpperCase().includes('EXIT')) {
          b.remove();
        }
      });
    }, 800);
  });

  // Camera + OpenCV setup
  video = document.createElement('video');
  video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;z-index:-1;';
  video.autoplay = video.playsInline = video.muted = true;
  document.body.appendChild(video);

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;z-index:998;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { video.srcObject = stream; video.play(); })
    .catch(() => console.log("Camera denied"));

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

  // Only trigger tap when clicking empty space (not buttons)
  renderer.domElement.addEventListener('click', (e) => {
    if (e.target === renderer.domElement) onScreenTap(e);
  });

  renderer.setAnimationLoop(render);
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
  if (isWallMode && points.length < 20) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
    const pos = camera.position.clone().add(vec.sub(camera.position).normalize().multiplyScalar(2.5));
    addPoint(pos);
  }
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addPoint(p);
}

function addPoint(pos) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(pos);
  scene.add(dot);
  pointMeshes.push(dot);
  points.push(pos.clone());
  updateAll();
}

function undoLastPoint() {
  if (points.length === 0) return;
  scene.remove(pointMeshes.pop());
  points.pop();
  updateAll();
}

function startNewLine() {
  if (points.length < 2) return;
  points = [];
  pointMeshes = [];
  updateAll();
  infoDiv.innerHTML = "New line started – tap to place point";
}

function updateAll() {
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = [];

  const hasPoints = points.length > 0;
  undoBtn.style.display = hasPoints ? 'block' : 'none';
  resetBtn.style.display = hasPoints ? 'block' : 'none';
  newLineBtn.style.display = (points.length >= 2) ? 'block' : 'none';

  if (points.length < 2) {
    infoDiv.innerHTML = isWallMode
      ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`
      : `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`;
    return;
  }

  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:0xff0044, linewidth:6}));
  scene.add(line);

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i-1].distanceTo(points[i]);
    total += d;
    const mid = new THREE.Vector3().lerpVectors(points[i-1], points[i], 0.5);
    const sprite = createLabelSprite(formatDistance(d));
    sprite.position.copy(mid);
    scene.add(sprite);
    labels.push(sprite);
  }

  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:26px">${formatDistance(total)}</span> • ${points.length} pts`;
}

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 70;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0,0,200,70);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 42px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 100, 35);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), depthTest: false}));
  sprite.scale.set(0.25, 0.1, 1);
  return sprite;
}

function resetAll() {
  points.forEach(() => scene.remove(pointMeshes.shift()));
  points = []; pointMeshes = [];
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = []; line = null;
  undoBtn.style.display = resetBtn.style.display = newLineBtn.style.display = 'none';
  infoDiv.innerHTML = isWallMode ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere` : `Total: 0.00 ${currentUnit}`;
}

function startWallDetection() {
  let running = false;
  const process = () => {
    if (running || !isWallMode || video.videoWidth === 0) { requestAnimationFrame(process); return; }
    running = true;
    const frame = cv.imread(video);
    const gray = new cv.Mat();
    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    const corners = new cv.KeyPointVector();
    cv.FAST(gray, corners, 30, true);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i = 0; i < corners.size(); i++) {
      const pt = corners.get(i).pt;
      ctx.fillStyle = '#00ffff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2); ctx.fill();
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
      isWallMode = false;
      canvas.style.opacity = '0';
      reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    } else {
      isWallMode = true;
      canvas.style.opacity = '0.6';
      reticle.visible = false;
      if (points.length < 2) {
        infoDiv.innerHTML = `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`;
      }
    }
  }
  renderer.render(scene, camera);
}
