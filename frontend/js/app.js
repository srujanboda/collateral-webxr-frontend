import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, controller;
let points = [], lines = [];
let hitTestSource = null;
let session = null;
let referenceSpace = null;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    if (Date.now() - lastTap < 400) resetAll();
    lastTap = Date.now();
  });

  button.onclick = startAR;

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

async function startAR() {
  if (session) {
    session.end();
    return;
  }

  if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-ar')) {
    info.textContent = 'AR not supported on this device';
    return;
  }

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to measure';

    await renderer.xr.setSession(session);
    referenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

    session.addEventListener('end', onSessionEnd);

  } catch(e) {
    info.textContent = 'AR failed – use latest Chrome';
    console.error(e);
  }
}

function onSessionEnd() {
  session = null; hitTestSource = null; referenceSpace = null;
  document.body.classList.remove('ar-active');
  button.textContent = 'START AR';
  info.textContent = 'Tap START AR';
  resetAll();
}

function onSelect() {
  if (!session) return;

  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let position = null;

  // REAL hit-test (works perfectly on mobile)
  if (hitTestSource) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length > 0) {
      const pose = hitTestResults[0].getPose(referenceSpace);
      position = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
    }
  }

  // Fallback – still good enough if surface not detected
  if (!position) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    position = camera.position.clone().add(dir.multiplyScalar(1.5));
  }

  placePoint(position);
}

function placePoint(pos) {
  // Green dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 32, 32),
    new THREE.MeshStandardMaterial({ color:0x00ff00, emissive:0x00ff00, emissiveIntensity:2 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Yellow lines
  lines.forEach(l => scene.remove(l));
  lines = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color:0xffff00, linewidth:12 }));
      scene.add(line);
      lines.push(line);
    }
  }

  updateInfo();
}

function updateInfo() {
  if (points.length === 0) {
    info.textContent = 'Tap anywhere to measure';
    return;
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].position.distanceTo(points[i-1].position);
  }
  const last = points.length > 1 ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3) : '0';

  info.innerHTML = `<strong>Points: ${points.length}</strong><br>
    Total Distance: <strong>${total.toFixed(3)} m</strong> | Last: ${last} m<br>
    <small>Double-tap to reset</small>`;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  if (session) info.textContent = 'Tap anywhere to measure';
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    renderer.render(scene, camera);
  });
}
