import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, controller;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;

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
  window.onresize = () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
}

async function startAR() {
  if (session) { session.end(); return; }

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to place point';

    await renderer.xr.setSession(session);
    referenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

    session.addEventListener('end', () => {
      session = null; hitTestSource = null;
      document.body.classList.remove('ar-active');
      button.textContent = 'START AR';
      info.textContent = 'Tap START AR to begin';
      resetAll();
    });

  } catch(e) {
    info.textContent = 'AR not supported or denied';
    console.error(e);
  }
}

function onSelect() {
  if (!session) return;
  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let pos = new THREE.Vector3();

  if (hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const hit = hits[0];
      const pose = hit.getPose(referenceSpace);
      pos.setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
    }
  }

  if (pos.lengthSq() === 0) {
    camera.getWorldDirection(pos);
    pos.multiplyScalar(1.2).add(camera.position);
  }

  placePoint(pos);
}

function placePoint(p) {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 32, 32),
    new THREE.MeshStandardMaterial({ color:0x00ff00, emissive:0x00ff00, emissiveIntensity:1 })
  );
  dot.position.copy(p);
  scene.add(dot);
  points.push(dot);

  lines.forEach(l => scene.remove(l));
  lines = [];

  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]),
        new THREE.LineBasicMaterial({ color:0xffff00, linewidth:6 })
      );
      scene.add(line);
      lines.push(line);
    }
  }
  updateInfo();
}

function updateInfo() {
  if (points.length === 0) return;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].position.distanceTo(points[i-1].position);
  const last = points.length > 1 ? points[points.length-1].position.distanceTo(points[points.length-2].position).toFixed(3) : 0;

  info.innerHTML = `<strong>${points.length} points</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last} m<br>
    <small>Double-tap → reset</small>`;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  if (session) info.textContent = 'Tap anywhere to place point';
}

function animate() {
  renderer.setAnimationLoop((t, f) => renderer.render(scene, camera));
}
