// js/app.js - CLEAN, FAST, PROFESSIONAL AR MEASURE (2025 version)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, controller;
let points = [];
let lines = [];
let hitTestSource = null;
let hitTestSourceRequested = false;

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

  // LIGHT
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // RETICLE (small green ring)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.8, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // CUSTOM SMALL AR BUTTON (top-left)
  const arButton = document.createElement('button');
  arButton.textContent = 'START AR';
  arButton.style.position = 'absolute';
  arButton.style.top = '20px';
  arButton.style.left = '20px';
  arButton.style.padding = '12px 20px';
  arButton.style.fontSize = '16px';
  arButton.style.fontWeight = 'bold';
  arButton.style.background = '#007AFF';
  arButton.style.color = 'white';
  arButton.style.border = 'none';
  arButton.style.borderRadius = '12px';
  arButton.style.zIndex = '999';
  document.body.appendChild(arButton);

  // Use minimal session with hit-test + dom-overlay
  arButton.addEventListener('click', () => {
    renderer.xr.getSession()?.end(); // in case already running
    renderer.setAnimationLoop(null);

    // Hide everything from 2D mode
    document.getElementById('videoFeed').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('startBtn').style.display = 'none';

    const sessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    };

    navigator.xr.requestSession('immersive-ar', sessionInit).then(session => {
      renderer.xr.setSession(session);

      // Change button to STOP
      arButton.textContent = 'STOP AR';
      arButton.style.background = '#FF3B30';

      session.addEventListener('end', () => {
        arButton.textContent = 'START AR';
        arButton.style.background = '#007AFF';
        document.getElementById('videoFeed').style.display = 'block';
        document.getElementById('startBtn').style.display = 'block';
      });
    });
  });

  // Controller (tap to place)
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    const now = Date.now();
    if (now - lastTap < 400) resetAll();
    lastTap = now;
  });

  // Hide 2D stuff initially
  document.getElementById('info').textContent = 'Tap START AR to begin';
  window.addEventListener('resize', onWindowResize);
}

function onSelect() {
  if (!reticle.visible && points.length === 0) {
    // First point: place in front of camera even without hit-test
    const pos = new THREE.Vector3(0, 0, -0.5);
    pos.applyQuaternion(camera.quaternion);
    pos.add(camera.position);
    placeDot(pos);
    return;
  }

  if (reticle.visible) {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(reticle.matrix);
    placeDot(pos);
  }
}

function placeDot(position) {
  // Green dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00 })
  );
  dot.position.copy(position);
  scene.add(dot);
  points.push(dot);

  // Remove old lines
  lines.forEach(l => scene.remove(l));
  lines = [];

  // Draw yellow lines
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 5 }));
      scene.add(line);
      lines.push(line);
    }
  }

  updateDistance();
}

function updateDistance() {
  if (points.length < 2) {
    document.getElementById('info').innerHTML = `<strong>${points.length} point${points.length === 1 ? '' : 's'}</strong><br>Tap to place next`;
    return;
  }

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].position.distanceTo(points[i-1].position);
  }

  const last = points[points.length-1].position.distanceTo(points[points.length-2].position);

  document.getElementById('info').innerHTML = `
    <strong>${points.length} points</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last.toFixed(3)} m<br>
    <small style="color:#ff9500258;">Double-tap to reset</small>
  `;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = [];
  lines = [];
  reticle.visible = false;
  document.getElementById('info').textContent = 'Tap to place first point';
}

// Hit testing (fast & reliable)
function handleHitTest(frame) {
  if (!hitTestSourceRequested) {
    const session = renderer.xr.getSession();
    session.requestReferenceSpace('viewer').then(refSpace => {
      session.requestHitTestSource({ space: refSpace }).then(source => {
        hitTestSource = source;
      });
    });
    hitTestSourceRequested = true;
  }

  if (hitTestSource) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(renderer.xr.getReferenceSpace());
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false; // hide only if no surface
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    if (frame) handleHitTest(frame);
    renderer.render(scene, camera);
  });
}
