import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null;
let session = null;
let latestHitPose = null;
let frameCount = 0;
let fallbackTimeout = null;

const info = document.getElementById('info');
const arButton = document.getElementById('arButton');
const stopButton = document.getElementById('stopButton');

init();
renderer?.setAnimationLoop(animate);

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  const ringGeom = new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI / 2);
  reticle = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  arButton.addEventListener('click', startAR);
  stopButton.addEventListener('click', () => session?.end());

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startAR() {
  if (session) return;

  try {
    const perm = await navigator.permissions.query({ name: 'camera' });
    if (perm.state === 'denied') {
      info.textContent = 'Camera access denied—check settings';
      return;
    }
  } catch (e) {
    console.warn('Permission check skipped:', e);
  }

  try {
    console.log('🔄 Starting AR...');
    info.textContent = 'Launching AR—scan room...';
    document.body.classList.add('ar-active');

    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    renderer.xr.setSession(session);
    session.addEventListener('select', onSelect);
    session.addEventListener('end', onSessionEnd);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    console.log('✅ AR active');
    info.textContent = 'Point at surface—tap green ring to measure';

    fallbackTimeout = setTimeout(checkFallback, 2000);

  } catch (e) {
    console.warn('Primary AR failed:', e);
    try {
      session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'] });
      renderer.xr.setSession(session);
      session.addEventListener('select', onSelect);
      // Repeat reference spaces...
      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      info.textContent = 'AR basic mode—tap to place';
    } catch (e2) {
      console.error('AR impossible:', e2);
      info.textContent = 'AR not supported—falling back to camera';
      loadFallback();
      return;
    }
  }
}

function checkFallback() {
  if (frameCount < 30) {
    console.warn('Black screen detected—fallback');
    session?.end();
    loadFallback();
  }
}

function onSelect() {
  if (reticle.visible && latestHitPose) {
    const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    placePoint(pos);
  }
}

function animate(time, frame) {
  frameCount++;
  if (!frame || !session || !hitTestSource) return;

  const hitTestResults = frame.getHitTestResults(hitTestSource);
  if (hitTestResults.length) {
    latestHitPose = hitTestResults[0].getPose(renderer.xr.getReferenceSpace());
    if (latestHitPose) {
      reticle.visible = true;
      reticle.matrix.fromArray(latestHitPose.transform.matrix);
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
    }
  } else {
    reticle.visible = false;
    latestHitPose = null;
  }

  renderer.render(scene, camera);
}

function placePoint(pos) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  lines.forEach(l => scene.remove(l));
  lines = [];
  for (let i = 1; i < points.length; i++) {
    const geometry = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 }));
    scene.add(line);
    lines.push(line);
  }
  updateInfo();
}

function updateInfo() {
  if (points.length < 2) {
    info.textContent = points.length ? '1 point—tap another' : 'Tap ring to place first point';
    return;
  }
  let total = 0, last = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].position.distanceTo(points[i-1].position);
    total += d;
    if (i === points.length - 1) last = d;
  }
  info.innerHTML = `${points.length} points<br>Total: ${total.toFixed(2)}m | Last: ${last.toFixed(2)}m`;
}

function onSessionEnd() {
  console.log('Session ended');
  session = null;
  hitTestSource?.release();
  document.body.classList.remove('ar-active');
  if (fallbackTimeout) clearTimeout(fallbackTimeout);
  info.textContent = 'AR ended—tap Start to retry';
  resetAll();
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  updateInfo();
}

async function loadFallback() {
  document.body.classList.add('measurement-active');
  await import('./opencvMeasure.js');
}
