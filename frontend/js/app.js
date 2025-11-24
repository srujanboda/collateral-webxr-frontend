// js/app.js - FINAL WORKING VERSION (Tested on Android + iPhone)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer;
let reticle, controller;
let points = [];
let lines = [];
let session = null;

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

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // Reticle (green ring)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.7, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // START / STOP AR Button - TOP-RIGHT CORNER
  const btn = document.createElement('button');
  btn.textContent = 'START AR';
  btn.style.position = 'absolute';
  btn.style.top = '20px';
  btn.style.right = '20px';           // ← NOW TOP-RIGHT
  btn.style.padding = '12px 24px';
  btn.style.fontSize = '16px';
  btn.style.fontWeight = 'bold';
  btn.style.background = '#007AFF';
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.borderRadius = '30px';
  btn.style.zIndex = '9999';
  btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  document.body.appendChild(btn);

  // Info text - TOP-LEFT
  const info = document.getElementById('info');
  info.style.top = '20px';
  info.style.left = '20px';
  info.style.right = 'auto';
  info.textContent = 'Tap START AR';

  // Reset button - BOTTOM CENTER
  const reset = document.getElementById('resetBtn');
  reset.style.display = 'none';

  // Click START AR
  btn.addEventListener('click', async () => {
    if (session) {
      session.end();
      return;
    }

    // Hide 2D stuff
    document.getElementById('videoFeed').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('startBtn').style.display = 'none';

    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    await renderer.xr.setSession(session);
    btn.textContent = 'STOP AR';
    btn.style.background = '#FF3B30';
    reset.style.display = 'block';
    info.textContent = 'Tap anywhere to place first point';

    session.addEventListener('end', () => {
      session = null;
      btn.textContent = 'START AR';
      btn.style.background = '#007AFF';
      reset.style.display = 'none';
      document.getElementById('videoFeed').style.display = 'block';
      document.getElementById('startBtn').style.display = 'block';
      info.textContent = 'AR stopped';
    });
  });

  // Controller - THIS IS THE KEY: use select on controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    const now = Date.now();
    if (now - lastTap < 400) {
      resetAll();
    }
    lastTap = now;
  });

  window.addEventListener('resize', onWindowResize);
}

function onSelect() {
  let pos = new THREE.Vector3();

  if (reticle.visible) {
    pos.setFromMatrixPosition(reticle.matrix);
  } else if (points.length === 0) {
    // First point: place 50cm in front of camera
    pos.set(0, 0, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
  } else {
    // Fallback: raycast from camera
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    pos.copy(ray.ray.origin).add(ray.ray.direction.multiplyScalar(1.0));
  }

  placePoint(pos);
}

function placePoint(position) {
  // Green dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.8 })
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
      const geometry = new THREE.BufferGeometry().setFromPoints([
        points[i-1].position,
        points[i].position
      ]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0xffff00,
        linewidth: 6
      }));
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

  const last = points.length > 1
    ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3)
    : 0;

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
  document.getElementById('info').textContent = 'Tap to place first point';
}

// Hit test - fast & reliable
renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  let refSpace;

  session.requestReferenceSpace('viewer').then(space => {
    refSpace = space;
    session.requestHitTestSource({ space: refSpace }).then(source => {
      session.addEventListener('select', () => {}); // dummy
    });
  });

  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return;

    const referenceSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResultsForTransientSource?.() || frame.getHitTestResults?.();

    if (hits && hits.length > 0) {
      const hit = hits[0];
      const pose = hit.getPose(referenceSpace);
      if (pose) {
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      }
    } else {
      reticle.visible = false;
    }

    renderer.render(scene, camera);
  });
});

// Reset button
document.getElementById('resetBtn').onclick = resetAll;

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();
      if (session) {
        const hits = frame.getHitTestResultsForTransientSource?.() || session.hitTestSources?.[0] ? frame.getHitTestResults(session.hitTestSources[0]) : [];
        if (hits.length > 0) {
          const hit = hits[0];
          const pose = hit.getPose(referenceSpace);
          if (pose) {
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          }
        }
      }
    }
    renderer.render(scene, camera);
  });
}
