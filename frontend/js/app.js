import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null;
let session = null;

const info   = document.getElementById('info');
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

  // Bright green reticle
  const ringGeom = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  button.addEventListener('click', startARSession);
  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startARSession() {
  if (session) {
    session.end();
    return;
  }

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to place points';

    await renderer.xr.setSession(session);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    session.addEventListener('end', () => {
      session = null;
      hitTestSource = null;
      document.body.classList.remove('ar-active');
      button.textContent = 'START AR';
      info.textContent = 'Tap START AR to begin';
      resetAll();
    });

  } catch (e) {
    info.textContent = 'AR not supported on this device';
    console.error(e);
  }
}

function animate(time, frame) {
  renderer.setAnimationLoop(animate);

  if (!frame || !hitTestSource) return;

  const results = frame.getHitTestResults(hitTestSource);
  if (results.length > 0) {
    const pose = results[0].getPose(renderer.xr.getReferenceSpace());
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
  } else {
    reticle.visible = false;
  }

  // Reliable tap detection in full-screen AR
  const xrSession = renderer.xr.getSession();
  if (xrSession) {
    for (const source of xrSession.inputSources) {
      if (source.gamepad && source.gamepad.buttons[0].pressed) {
        if (reticle.visible) {
          const pos = new THREE.Vector3();
          pos.setFromMatrixPosition(reticle.matrix);
          placePoint(pos);
        }
        break;
      }
    }
  }

  renderer.render(scene, camera);
}

function placePoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Redraw lines
  lines.forEach(l => scene.remove(l));
  lines = [];
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
    info.innerHTML = `<strong>${points.length} point(s)</strong>`;
    return;
  }

  let total = 0;
  let last = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].position.distanceTo(points[i-1].position);
    if (i === points.length - 1) last = d;
    total += d;
  }

  info.innerHTML = `
    <strong>${points.length} points</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last.toFixed(3)} m<br>
    <small>Double-tap to reset</small>
  `;
}

// Double-tap reset
let lastTap = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  updateInfo();
}
