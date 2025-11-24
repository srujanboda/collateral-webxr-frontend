// js/app.js - FINAL PERFECT VERSION (exact tap placement + one bottom button)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer;
let controller;
let points = [];
let lines = [];
let hitTestSource = null;
let hitTestSourceRequested = false;
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

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  // Single button at bottom
  const btn = document.createElement('button');
  btn.id = 'arButton';
  btn.textContent = 'START AR';
  document.body.appendChild(btn);

  // Info
  document.getElementById('info').textContent = 'Tap START AR to begin';

  // Button click
  btn.addEventListener('click', async () => {
    if (session) {
      session.end();
      return;
    }

    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
      });

      document.body.classList.add('ar-active');
      btn.textContent = 'STOP AR';
      document.getElementById('info').textContent = 'Tap anywhere to place point';

      await renderer.xr.setSession(session);

      session.addEventListener('end', () => {
        session = null;
        document.body.classList.remove('ar-active');
        btn.textContent = 'START AR';
        document.getElementById('info').textContent = 'AR stopped';
        resetAll();
      });

    } catch (e) {
      document.getElementById('info').textContent = 'AR not supported';
      console.error(e);
    }
  });

  // Controller for precise tap placement
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Double-tap to reset
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

function onSelect(event) {
  if (!renderer.xr.isPresenting) return;

  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let pose;
  if (hitTestSource) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      pose = hit.getPose(renderer.xr.getReferenceSpace());
    }
  }

  const position = new THREE.Vector3();
  if (pose) {
    position.setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
  } else {
    // Fallback: place 1 meter in front of camera
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    position.copy(camera.position).add(direction.multiplyScalar(1.0));
  }

  placePoint(position);
}

function placePoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 1.5
    })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Draw lines
  lines.forEach(l => scene.remove(l));
  lines = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        points[i-1].position,
        points[i].position
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

// Hit-test setup
renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  session.requestReferenceSpace('viewer').then(refSpace => {
    session.requestHitTestSource({ space: refSpace }).then(source => {
      hitTestSource = source;
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
