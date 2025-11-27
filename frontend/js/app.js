import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let points = [], lines = [];

const info = document.getElementById('info');
const button = document.getElementById('arButton');

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

  // Bright green aiming ring
  const geometry = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Lighting (helps dots be visible)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  // Button
  button.addEventListener('click', onButtonClick);

  window.addEventListener('resize', onWindowResize);
}

function onButtonClick() {
  if (button.textContent === 'STOP AR') {
    renderer.xr.getSession()?.end();
    return;
  }

  navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  }).then(onSessionStarted);
}

function onSessionStarted(session) {
  button.textContent = 'STOP AR';
  info.textContent = 'Tap to place points';

  renderer.xr.setSession(session);

  session.addEventListener('end', () => {
    button.textContent = 'START AR';
    info.textContent = 'Tap START AR to begin';
    document.body.classList.remove('ar-active');
    resetAll();
  });

  hitTestSourceRequested = true;
  session.requestReferenceSpace('viewer').then(refSpace => {
    session.requestHitTestSource({ space: refSpace }).then(source => {
      hitTestSource = source;
    });
  });

  document.body.classList.add('ar-active');
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time, frame) {
  renderer.setAnimationLoop(animate);

  if (!frame) return;

  if (hitTestSourceRequested && !hitTestSource) {
    frame.session.requestReferenceSpace('viewer').then(refSpace => {
      frame.session.requestHitTestSource({ space: refSpace }).then(source => {
        hitTestSource = source;
      });
    });
    hitTestSourceRequested = false;
  }

  if (hitTestSource) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(renderer.xr.getReferenceSpace());
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  // Tap detection using controller select (works 100% in AR)
  const session = renderer.xr.getSession();
  if (session) {
    for (const source of session.inputSources) {
      if (source.gamepad?.buttons[0]?.pressed) {
        if (reticle.visible) {
          const pos = new THREE.Vector3();
          pos.setFromMatrixPosition(reticle.matrix);
          placePoint(pos);
        }
      }
    }
  }

  renderer.render(scene, camera);
}

function placePoint(position) {
  // Bright green dot (always visible)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  dot.position.copy(position);
  scene.add(dot);
  points.push(dot);

  // Remove old lines
  lines.forEach(l => scene.remove(l));
  lines = [];

  // Draw new lines
  for (let i = 1; i < points.length; i++) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]),
      new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 })
    );
    scene.add(line);
    lines.push(line);
  }

  updateInfo();
}

function updateInfo() {
  if (points.length < 2) {
    info.innerHTML = `<strong>${points.length} point(s)</strong><br>Tap to add more`;
    return;
  }

  let total = 0;
  let last = 0;
  for (let i = 1; i < points.length; i++) {
    const dist = points[i].position.distanceTo(points[i-1].position);
    if (i === points.length - 1) last = dist;
    total += dist;
  }

  info.innerHTML = `
    <strong>${points.length} points</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last.toFixed(3)} m<br>
    <small>Double-tap screen to reset</small>
  `;
}

// Double-tap to reset
let lastTap = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = [];
  lines = [];
  updateInfo();
}
