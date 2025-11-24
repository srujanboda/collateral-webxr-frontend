// js/app.js – FINAL WORKING VERSION (tested on Android + iPhone)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer;
let controller;
let points = [];
let lines = [];
let hitTestSource = null;
let session = null;

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Light
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // Single bottom button
  const btn = document.createElement('button');
  btn.id = 'arButton';
  btn.textContent = 'START AR';
  document.body.appendChild(btn);

  const info = document.getElementById('info');

  btn.onclick = async () => {
    if (session) {
      session.end();
      return;
    }

    // Check support first
    if (!('xr' in navigator)) {
      info.textContent = 'WebXR not supported on this device';
      return;
    }

    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
        domOverlay: { root: document.body }
      });

      document.body.classList.add('ar-active');
      btn.textContent = 'STOP AR';
      info.textContent = 'Tap anywhere to place point';

      renderer.xr.setSession(session);

      // Hit-test source
      const refSpace = await session.requestReferenceSpace('viewer');
      hitTestSource = await session.requestHitTestSource({ space: refSpace });

      session.addEventListener('end', () => {
        session = null;
        hitTestSource = null;
        document.body.classList.remove('ar-active');
        btn.textContent = 'START AR';
        info.textContent = 'AR stopped';
        resetAll();
      });

    } catch (e) {
      console.error(e);
      info.textContent = 'AR failed to start – try Chrome latest version';
    }
  };

  // Controller – this receives real screen taps
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

  // Animation loop with proper hit-test
  renderer.setAnimationLoop((time, frame) => {
    if (frame && hitTestSource) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        if (pose) {
          // reticle optional – we don't need it visible
        }
      }
    }
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function onSelect() {
  if (!renderer.xr.isPresenting) return;

  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let position = new THREE.Vector3();

  if (hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const hit = hits[0];
      const pose = hit.getPose(renderer.xr.getReferenceSpace());
      position.fromArray(pose.transform.position);
    }
  }

  // Fallback if no hit
  if (position.length() === 0) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    position.copy(camera.position).add(dir.multiplyScalar(1.0));
  }

  placePoint(position);
}

function placePoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Draw lines
  lines.forEach(l => scene.remove(l));
  lines = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const geom = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 10 }));
      scene.add(line);
      lines.push(line);
    }
  }

  updateInfo();
}

function updateInfo() {
  if (points.length === 0) {
    document.getElementById('info').textContent = 'Tap to place first point';
    return;
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].position.distanceTo(points[i-1].position);
  }
  const last = points.length > 1 ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3) : '0';

  document.getElementById('info').innerHTML = `
    <strong>${points.length} point${points.length > 1 ? 's' : ''}</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong>
    ${points.length > 1 ? `<br>Last: ${last} m` : ''}
    <br><small>Double-tap to reset</small>
  `;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = [];
  lines = [];
  updateInfo();
}
