import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Bright green ring
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.03, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 8));

  button.onclick = startAR;

  // TAP = RING + DOT (works perfectly)
  renderer.domElement.addEventListener('touchend', onScreenTap);
  renderer.domElement.addEventListener('click', onScreenTap);

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
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: { root: document.body }
  });

  document.body.classList.add('ar-active');
  button.textContent = 'STOP AR';
  info.textContent = 'Tap anywhere to place dot';

  renderer.xr.setReferenceSpaceType('local-floor');
  await renderer.xr.setSession(session);

  referenceSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

  renderer.setAnimationLoop(animate);

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    session = null; hitTestSource = null; referenceSpace = null;
    document.body.classList.remove('ar-active');
    button.textContent = 'START AR';
    info.textContent = 'Tap START AR to begin';
    resetAll();
  });
}

function onScreenTap(e) {
  e.preventDefault();
  if (!session) return;

  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let hitPose = null;
  if (hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) hitPose = hits[0].getPose(referenceSpace);
  }

  let position;
  if (hitPose) {
    // Exact surface hit
    position = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(hitPose.transform.matrix));
    reticle.matrix.fromArray(hitPose.transform.matrix);
  } else {
    // Fallback: 70 cm in front of camera
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    position = camera.position.clone().add(dir.multiplyScalar(0.7));
    reticle.visible = false;
  }

  reticle.visible = true;
  placePoint(position);
}

function animate(time, frame) {
  if (frame && hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(referenceSpace);
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.visible = true;
    }
  }
  renderer.render(scene, camera);
}

function placePoint(pos) {
  // Tiny bright dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 24, 16),
    new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 2
    })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Yellow line
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
  const last = points.length > 1 ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3) : '0.000';

  info.innerHTML = `<strong>${points.length} pts</strong><br>Total: <strong>${total.toFixed(3)} m</strong><br>Last: ${last} m<br><small>Double-tap to reset</small>`;
}

// Double-tap reset
let lastTapTime = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTapTime < 400) resetAll();
  lastTapTime = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  reticle.visible = false;
  if (session) info.textContent = 'Tap anywhere to place dot';
}
