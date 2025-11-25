import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, controller, reticle;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;
let pendingPlacement = false;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Tiny aiming ring (barely visible, just for precision)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.6, transparent: true })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => pendingPlacement = true);
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    if (Date.now() - lastTap < 400) resetAll();
    lastTap = Date.now();
  });

  // Tap support
  renderer.domElement.addEventListener('click', () => pendingPlacement = true);
  renderer.domElement.addEventListener('touchend', e => { e.preventDefault(); pendingPlacement = true; });

  button.onclick = startAR;
  window.onresize = () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
}

async function startAR() {
  if (session) { session.end(); return; }

  session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });

  document.body.classList.add('ar-active');
  button.textContent = 'STOP AR';
  info.textContent = 'Point & tap to measure';

  await renderer.xr.setSession(session);
  referenceSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

  session.addEventListener('end', () => {
    session = null; hitTestSource = null; referenceSpace = null;
    document.body.classList.remove('ar-active');
    button.textContent = 'START AR';
    info.textContent = 'Tap START AR to begin';
    resetAll();
  });
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    if (frame && hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(referenceSpace);
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;

        if (pendingPlacement) {
          pendingPlacement = false;
          placePoint(new THREE.Vector3().setFromMatrixPosition(reticle.matrix));
        }
      } else {
        reticle.visible = false;
        if (pendingPlacement) {
          pendingPlacement = false;
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          placePoint(camera.position.clone().add(dir.multiplyScalar(0.6)));
        }
      }
    }
    renderer.render(scene, camera);
  });
}

function placePoint(pos) {
  // Tiny realistic green dot (1.5 cm)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.5 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Clean & redraw lines
  lines.forEach(l => scene.remove(l));
  lines = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]),
        new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 })
      );
      scene.add(line);
      lines.push(line);
    }
  }

  updateInfo();
}

function updateInfo() {
  if (!points.length) return;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].position.distanceTo(points[i-1].position);
  const last = points.length > 1 ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3) : 0;

  info.innerHTML = `<strong>${points.length} pts</strong><br>Total: <strong>${total.toFixed(3)} m</strong><br>Last: ${last} m<br><small>Double-tap to reset</small>`;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  if (session) info.textContent = 'Point & tap to measure';
}
