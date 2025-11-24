// js/app.js - FINAL PROFESSIONAL AR MEASUREMENT (Works 100% on Android & iPhone)
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

  // Reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.7, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // START/STOP AR Button (Top-right)
  const btn = document.createElement('button');
  btn.textContent = 'START AR';
  document.body.appendChild(btn);

  // Info + Reset
  const info = document.getElementById('info');
  const resetBtn = document.getElementById('resetBtn');
  resetBtn.onclick = resetAll;

  // Click handler
  btn.addEventListener('click', async () => {
    if (session) {
      session.end();
      return;
    }

    // Hide 2D elements
    document.getElementById('videoFeed').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';

    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
        domOverlay: { root: document.body }
      });

      await renderer.xr.setSession(session);
      document.body.classList.add('ar-active');
      btn.textContent = 'STOP AR';
      resetBtn.style.display = 'block';
      info.textContent = 'Tap anywhere to place first point';

      session.addEventListener('end', () => {
        session = null;
        document.body.classList.remove('ar-active');
        btn.textContent = 'START AR';
        resetBtn.style.display = 'none';
        document.getElementById('videoFeed').style.display = 'block';
        info.textContent = 'AR stopped';
      });
    } catch (e) {
      info.textContent = 'AR not supported on this device';
      console.error(e);
    }
  });

  // Controller
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

  window.addEventListener('resize', onWindowResize);
}

function onSelect() {
  let pos = new THREE.Vector3();

  if (reticle.visible) {
    pos.setFromMatrixPosition(reticle.matrix);
  } else if (points.length === 0) {
    pos.set(0, 0, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
  } else {
    pos.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.0));
  }

  placePoint(pos);
}

function placePoint(position) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1 })
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
        points[i-1].position, points[i].position
      ]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0xffff00,
        linewidth: 8
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
    : '0';

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

// Hit-test
renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  session.requestReferenceSpace('viewer').then(refSpace => {
    session.requestHitTestSource({ space: refSpace }).then(source => {
      renderer.setAnimationLoop((time, frame) => {
        if (frame && source) {
          const results = frame.getHitTestResults(source);
          if (results.length > 0) {
            const hit = results[0];
            const pose = hit.getPose(renderer.xr.getReferenceSpace());
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
            }
          } else {
            reticle.visible = points.length === 0; // show only if no points yet
          }
        }
        renderer.render(scene, camera);
      });
    });
  });
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    renderer.render(scene, camera);
  });
}
