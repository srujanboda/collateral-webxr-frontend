// js/app.js — FINAL LAYOUT (New Line top-right, Reset bottom-left)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let allChains = [];
let currentChain = null;
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

  // BUTTONS — NEW POSITIONS
  undoBtn = createBtn('↺', 'bottom:100px;right:20px;width:48px;height:48px;border-radius:50%;background:#333;font-size:24px;', undoLastPoint);
  unitBtn = createBtn('m', 'top:90px;left:20px;width:48px;height:48px;border-radius:50%;background:#0066ff;', toggleUnit);

  // New Line → TOP-RIGHT
  newLineBtn = createBtn('New Line', 'top:20px;right:20px;background:#444;padding:10px 18px;font-size:14px;border-radius:18px;', startNewLine);

  // Reset → BOTTOM-LEFT
  resetBtn = createBtn('Reset', 'bottom:100px;left:20px;background:#ff3333;padding:10px 18px;font-size:14px;border-radius:18px;', resetAll);

  [undoBtn, newLineBtn, resetBtn].forEach(b => b.style.display = 'none');

  // AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  arButton.classList.add('custom-ar-button'); // Add class for control
  document.body.appendChild(arButton);

  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(b => {
        if (/stop|exit/i.test(b.textContent)) b.remove();
      });
    }, 1000);
  });

  // Video feed
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
    .catch(() => { });

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

  renderer.domElement.addEventListener('click', e => {
    if (e.target === renderer.domElement) onScreenTap(e);
  });

  renderer.setAnimationLoop(render);
  startNewLine();
}

function createBtn(text, style, fn) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = `position:fixed;z-index:9999;color:white;font:bold 16px system-ui;border:none;box-shadow:0 6px 20px rgba(0,0,0,0.5);${style}`;
  if (text.length <= 3) {
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
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({ color: 0x00ffaa }));
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
    const dist = currentChain.points[i - 1].distanceTo(currentChain.points[i]);
    const mid = new THREE.Vector3().lerpVectors(currentChain.points[i - 1], currentChain.points[i], 0.5);
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
  c.fillRect(0, 0, 220, 80);
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
      const d = chain.points[i].distanceTo(chain.points[i + 1]);
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
  ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, 220, 80);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 46px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 110, 40);
  return c;
}

function updateInfo() {
  const pts = currentChain.points.length;
  const total = pts < 2 ? 0 : currentChain.points.reduce((s, p, i) => i === 0 ? 0 : s + p.distanceTo(currentChain.points[i - 1]), 0);
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

// --- VIDEO CALL LOGIC & LANDING PAGE ---
let peer = null;
let myPeerId = null;
let currentCall = null;
let localStream = null;
let role = null; // 'user' or 'reviewer'
let isFallbackMode = false; // True if using Camera instead of Screen Share

// Landing Page Elements
const landingOverlay = document.getElementById('landing-overlay');
const selectUserBtn = document.getElementById('select-user');
const selectReviewerBtn = document.getElementById('select-reviewer');
const setupPanel = document.getElementById('setup-panel');
const setupReviewer = document.getElementById('setup-reviewer');
const setupUser = document.getElementById('setup-user');
const generatedIdDisplay = document.getElementById('generated-id');
const landingRemoteIdInput = document.getElementById('landing-remote-id');
const connectBtn = document.getElementById('connect-btn');
const enterArBtn = document.getElementById('enter-ar-btn');

// Video UI Elements
const videoControls = document.getElementById('video-controls');
const toggleVideoUiBtn = document.getElementById('toggle-video-ui');
const videoUiContent = document.getElementById('video-ui-content');
const recordingIndicator = document.getElementById('recording-indicator');
const remoteVideoContainer = document.getElementById('remote-video-container');
const remoteVideo = document.getElementById('remote-video');
const closeRemoteBtn = document.getElementById('close-remote-btn');
const endCallBtn = document.getElementById('end-call-btn');
const callStatus = document.getElementById('call-status');

// --- LANDING PAGE EVENTS ---

selectUserBtn.addEventListener('click', () => {
  role = 'user';
  selectUserBtn.classList.add('selected');
  selectReviewerBtn.classList.remove('selected');
  setupPanel.style.display = 'block';
  setupUser.style.display = 'block';
  setupReviewer.style.display = 'none';
  enterArBtn.disabled = true;
  enterArBtn.style.cursor = 'not-allowed';
});

selectReviewerBtn.addEventListener('click', () => {
  role = 'reviewer';
  selectReviewerBtn.classList.add('selected');
  selectUserBtn.classList.remove('selected');
  setupPanel.style.display = 'block';
  setupUser.style.display = 'none';
  setupReviewer.style.display = 'block';
  enterArBtn.disabled = false; // Reviewer can enter immediately if they want, or wait
  enterArBtn.style.cursor = 'pointer';
  initPeer(); // Auto-init for reviewer to get ID
});

connectBtn.addEventListener('click', () => {
  const remoteId = landingRemoteIdInput.value.trim();
  if (!remoteId) return alert("Please enter Reviewer ID");
  initPeer(remoteId);
});

enterArBtn.addEventListener('click', () => {
  landingOverlay.style.display = 'none';
  const arBtn = document.querySelector('.custom-ar-button');
  if (arBtn) arBtn.style.display = 'flex'; // Override CSS hidden
  videoControls.style.display = 'flex';
});

// --- PEERJS LOGIC ---

function initPeer(remoteIdToCall = null) {
  if (peer) return; // Already init

  peer = new Peer();

  peer.on('open', (id) => {
    myPeerId = id;
    if (role === 'reviewer') {
      generatedIdDisplay.textContent = id;
    } else if (role === 'user' && remoteIdToCall) {
      // User is ready to call
      startCall(remoteIdToCall);
    }
  });

  peer.on('call', (call) => {
    // Incoming call (Reviewer receiving)
    if (role === 'reviewer') {
      callStatus.textContent = "Incoming call...";
      call.answer(); // Answer empty (receive only)
      handleStream(call);
    }
  });

  peer.on('error', (err) => {
    console.error(err);
    alert("Connection Error: " + err.type);
  });
}

async function startCall(remoteId) {
  connectBtn.textContent = "Connecting...";
  isFallbackMode = false;

  try {
    // 1. Try Screen Share (Preferred for AR)
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: true
        });
      } catch (err) {
        console.warn("Screen share denied/failed, trying fallback.", err);
        throw new Error("Screen share failed"); // Trigger fallback
      }
    } else {
      throw new Error("Screen share not supported"); // Trigger fallback
    }

  } catch (err) {
    // 2. Fallback to Camera (Back Camera preferred)
    console.log("Falling back to camera...");
    isFallbackMode = true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true
      });
      alert("Mobile Mode: Camera active. When you enter AR, video will switch to AR view (lines only).");
    } catch (camErr) {
      console.error("Camera fallback failed", camErr);
      connectBtn.textContent = "Failed";
      alert("Could not start video. " + camErr.message);
      return;
    }
  }

  // Proceed with the obtained stream
  try {
    localStream.getVideoTracks()[0].onended = () => endCall();

    const call = peer.call(remoteId, localStream);
    handleStream(call);

    // Enable Enter AR button
    connectBtn.textContent = "Connected!";
    connectBtn.style.background = "#28a745";
    enterArBtn.disabled = false;
    enterArBtn.style.cursor = 'pointer';
    enterArBtn.style.background = "#0066ff";
  } catch (e) {
    console.error("Call setup failed", e);
    alert("Call setup failed: " + e.message);
  }
}

function handleStream(call) {
  currentCall = call;
  call.on('stream', (remoteStream) => {
    if (role === 'reviewer') {
      remoteVideoContainer.style.display = 'block';
      remoteVideo.srcObject = remoteStream;
      callStatus.textContent = "Viewing User Stream";
    } else {
      callStatus.textContent = "Sharing Screen";
    }
  });
  call.on('close', endCall);
}

// --- UI LOGIC ---

let isUiCollapsed = false;
toggleVideoUiBtn.addEventListener('click', () => {
  isUiCollapsed = !isUiCollapsed;
  videoUiContent.style.display = isUiCollapsed ? 'none' : 'block';
  toggleVideoUiBtn.textContent = isUiCollapsed ? '+' : '−';

  // Toggle Green Dot
  if (isUiCollapsed && currentCall) {
    recordingIndicator.style.display = 'inline-block';
  } else {
    recordingIndicator.style.display = 'none';
  }
});

endCallBtn.addEventListener('click', endCall);
closeRemoteBtn.addEventListener('click', () => {
  remoteVideoContainer.style.display = 'none';
  remoteVideo.srcObject = null;
});

function endCall() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  remoteVideo.srcObject = null;
  remoteVideoContainer.style.display = 'none';
  callStatus.textContent = "Call Ended";
  recordingIndicator.style.display = 'none';

  // Reset buttons if needed, or just leave as is.
  if (role === 'user') {
    connectBtn.textContent = "Connect & Start";
    connectBtn.style.background = "#0066ff";
  }
}

// --- AR SESSION LISTENERS (For Fallback Switching) ---

// We need to stop the camera *before* WebXR tries to take it.
// The ARButton handles the session request on click.
// We can add a 'click' listener to the ARButton that runs *first* (capturing phase or just added after?).
// ARButton is created in init(). Let's hook it there or here if we can find it.

function setupArButtonListener() {
  const arBtn = document.querySelector('.custom-ar-button');
  if (!arBtn) return;

  arBtn.addEventListener('click', async () => {
    if (isFallbackMode && localStream) {
      console.log("AR Button Clicked: Releasing Camera for WebXR...");

      // 1. Stop Camera Tracks IMMEDIATELLY
      // This frees the hardware for WebXR
      localStream.getVideoTracks().forEach(track => {
        track.stop();
        localStream.removeTrack(track);
      });

      // 2. Switch to Canvas Stream (so connection doesn't die)
      // We might need to wait for the canvas to actually have content, 
      // but we can start the stream now.
      const canvasStream = renderer.domElement.captureStream(30);
      const canvasTrack = canvasStream.getVideoTracks()[0];

      if (canvasTrack) {
        localStream.addTrack(canvasTrack);

        // Replace in PeerConnection
        if (currentCall && currentCall.peerConnection) {
          const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(canvasTrack);
        }
      }
    }
  });
}

// Call this setup
setupArButtonListener();

// We still keep sessionend to restart camera
renderer.xr.addEventListener('sessionend', async () => {
  if (isFallbackMode && currentCall && localStream) {
    console.log("AR Ended: Switching back to Camera");

    // 1. Stop Canvas Track
    const canvasTrack = localStream.getVideoTracks()[0];
    if (canvasTrack) {
      canvasTrack.stop();
      localStream.removeTrack(canvasTrack);
    }

    // 2. Restart Camera
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (newVideoTrack) {
        localStream.addTrack(newVideoTrack);

        // 3. Replace Track
        const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.error("Failed to restart camera after AR", err);
      alert("Could not restart camera.");
    }
  }
});
