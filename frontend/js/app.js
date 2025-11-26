import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [], labels = []; // Labels for distances
let hitTestSource = null, session = null, referenceSpace = null;

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

  // Small, bright ring (no lag)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.015, 0.025, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5));

  button.onclick = startAR;

  // Tap to place (exact position)
  renderer.domElement.addEventListener('touchend', onTap);
  renderer.domElement.addEventListener('click', onTap);

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
      optionalFeatures: ['dom-overlay', 'local-floor', 'bounded-depth'], // Better for angles
      domOverlay: { root: document.body }
    });

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to place point';

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

  } catch (e) {
    info.textContent = 'AR not supported or denied';
  }
}

function onTap(e) {
  e.preventDefault();
  if (!session) return;

  const frame = renderer.xr.getFrame();
  if (!frame) return;

  let position = new THREE.Vector3();

  // Hit-test for exact tap (any angle)
  if (hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(referenceSpace);
      position.setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.visible = true;
    } else {
      // Fallback (no surface) – center screen, 60cm in front
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      position = camera.position.clone().add(dir.multiplyScalar(0.6));
      reticle.visible = false;
    }
  } else {
    // No hit-test fallback
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    position = camera.position.clone().add(dir.multiplyScalar(0.6));
  }

  placePoint(position);
}

function animate(time, frame) {
  if (frame && hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(referenceSpace);
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.updateMatrixWorld(); // Smooth update
      reticle.visible = true;
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
}

function placePoint(pos) {
  // Tiny dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2 })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);

  // Lines
  lines.forEach(l => scene.remove(l));
  labels.forEach(l => scene.remove(l));
  lines = [];
  labels = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
      const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6 }));
      scene.add(line);
      lines.push(line);

      // Distance label on line
      const dist = points[i].position.distanceTo(points[i-1].position).toFixed(3);
      const midPoint = new THREE.Vector3().lerpVectors(points[i-1].position, points[i].position, 0.5);
      const label = createTextLabel(dist + ' m', midPoint);
      scene.add(label);
      labels.push(label);
    }
  }
  updateInfo();
}

// Create 3D text label for distance
function createTextLabel(text, position) {
  const loader = new THREE.FontLoader();
  loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
    const textGeometry = new THREE.TextGeometry(text, {
      font: font,
      size: 0.05,
      height: 0.01,
      curveSegments: 2
    });
    const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.copy(position);
    textMesh.lookAt(camera.position); // Face camera
    scene.add(textMesh);
  });
  return null; // Placeholder – text loads async
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
  labels.forEach(l => scene.remove(l));
  points = []; lines = []; labels = [];
  reticle.visible = false;
  if (session) info.textContent = 'Tap anywhere to place point';
}
