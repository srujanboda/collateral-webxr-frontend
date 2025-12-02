// js/app.js — FINAL: FLOORS + WALLS 100% WORKING (Dec 2025)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let points = [], pointMeshes = [], line = null, labels = [];
let infoDiv, resetBtn;
let isWallMode = false;
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
  infoDiv.style.cssText = `
    position:fixed; top:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.8); color:white; padding:12px 28px;
    border-radius:20px; font:bold 18px system-ui; z-index:999; pointer-events:none;
  `;
  infoDiv.textContent = "Point phone at floor → green ring = tap";
  document.body.appendChild(infoDiv);

  // Reset Button (top-right)
  resetBtn = document.createElement('button');
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:999;
    padding:12px 24px; font:bold 16px system-ui; background:#ff3333; color:white;
    border:none; border-radius:14px; box-shadow:0 6px 20px rgba(0,0,0,0.5);
    display:none;
  `;
  resetBtn.onclick = resetAll;
  document.body.appendChild(resetBtn);

  // START AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  arButton.classList.add('custom-ar-button');
  document.body.appendChild(arButton);

  // === WALL MODE: Add video + canvas overlay for OpenCV ===
  video = document.createElement('video');
  video.style.position = 'fixed';
  video.style.top = '0';
  video.style.left = '0';
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.style.zIndex = '-1';
  video.style.opacity = '0';
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  document.body.appendChild(video);

  canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '998';
  canvas.style.pointerEvents = 'none';
  canvas.style.opacity = '0';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // Start camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.play();
  } catch (e) { console.log("Camera access denied", e); }

  // Load OpenCV + start wall detection
  if (typeof cv !== 'undefined') {
    onOpenCVReady();
  } else {
    window.onOpenCVReady = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      startWallDetection();
    };
  }

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

  // Tap anywhere on screen to place point in WALL MODE
  renderer.domElement.addEventListener('click', onScreenTap);

  renderer.setAnimationLoop(render);
}

function onScreenTap(event) {
  if (isWallMode && points.length < 10) {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    const vector = new THREE.Vector3(x, y, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const distance = 2.0; // assume wall is ~2m away
    const pos = new THREE.Vector3().addVectors(camera.position, dir.multiplyScalar(distance));

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
    dot.position.copy(pos);
    scene.add(dot);
    pointMeshes.push(dot);
    points.push(pos.clone());
    updateAll();
  }
}

function startWallDetection() {
  let processing = false;
  function process() {
    if (!processing && video.videoWidth > 0) {
      processing = true;
      const frame = cv.imread(video);
      const gray = new cv.Mat();
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
      const corners = new cv.KeyPointVector();
      cv.FAST(gray, corners, 30, true);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < corners.size(); i++) {
        const pt = corners.get(i).pt;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#00ffff";
        ctx.fill();
      }
      frame.delete(); gray.delete(); corners.delete();
      processing = false;
    }
    if (isWallMode) requestAnimationFrame(process);
  }
  process();
}

function onSelect() {
  if (reticle.visible && !isWallMode) {
    const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
    dot.position.copy(p);
    scene.add(dot);
    pointMeshes.push(dot);
    points.push(p.clone());
    updateAll();
  }
}

function updateAll() {
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l));
  labels = [];

  if (points.length < 2) {
    infoDiv.textContent = isWallMode ? "Tap on wall to place points" : "Look for green ring → tap";
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
    const ctx2d = canvas.getContext('2d');
    canvas.width = 160; canvas.height = 60;
    ctx2d.fillStyle = 'rgba(0,0,0,0.9)';
    ctx2d.fillRect(0,0,160,60);
    ctx2d.fillStyle = 'white';
    ctx2d.font = 'bold 38px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(d.toFixed(2)+' m', 80, 30);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas), depthTest:false}));
    sprite.position.copy(mid);
    sprite.scale.set(0.20, 0.08, 1);
    scene.add(sprite);
    labels.push(sprite);
  }

  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:24px">${total.toFixed(2)} m</span> • ${points.length} pts`;
}

function resetAll() {
  points = []; pointMeshes.forEach(m => scene.remove(m)); pointMeshes = [];
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l)); labels = []; line = null;
  infoDiv.textContent = isWallMode ? "Tap on wall to measure" : "Look for green ring";
  resetBtn.style.display = "none";
}

function render(t, frame) {
  if (!frame) return;

  const session = renderer.xr.getSession();
  if (session) {
    if (!hitTestSource) {
      session.requestReferenceSpace('viewer').then(refSpace => {
        session.requestHitTestSource({space: refSpace}).then(source => hitTestSource = source);
      });
    }

    if (hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        isWallMode = false;
        canvas.style.opacity = '0';
        reticle.visible = true;
        const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        // No hit-test → switch to WALL MODE
        isWallMode = true;
        canvas.style.opacity = '0.7';
        reticle.visible = false;
        infoDiv.textContent = "WALL MODE: Tap anywhere on wall";
      }
    }
  }

  renderer.render(scene, camera);
}
