import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, controller, reticle;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;
let isARActive = false, pendingPlacement = false;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();
animate();

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

  // Smaller ring (cursor) – 2cm on screen
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.03, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.8, transparent: true, emissive: 0x004400 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => { pendingPlacement = true; });
  scene.add(controller);

  // Double-tap reset
  let lastTap = 0;
  controller.addEventListener('select', () => {
    if (Date.now() - lastTap < 400) resetAll();
    lastTap = Date.now();
  });

  // Tap to place
  renderer.domElement.addEventListener('click', () => { if (isARActive) pendingPlacement = true; });
  renderer.domElement.addEventListener('touchend', () => { if (isARActive) pendingPlacement = true; });

  button.addEventListener('click', startAR);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startAR() {
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
    info.textContent = 'Scan for surfaces...';

    await renderer.xr.setSession(session);
    isARActive = true;

    referenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

    reticle.visible = true; // Show small ring
    info.textContent = 'Point & tap to place dot';

    session.addEventListener('end', onSessionEnd);

  } catch (error) {
    console.error('AR Error:', error);
    info.textContent = 'AR failed: ' + error.message;
  }
}

function onSessionEnd() {
  session = null;
  hitTestSource = null;
  referenceSpace = null;
  isARActive = false;
  reticle.visible = false;
  document.body.classList.remove('ar-active');
  button.textContent = 'START AR';
  info.textContent = 'Tap START AR to begin';
  resetAll();
}

function animate() {
  renderer.setAnimationLoop((time, frame) => {
    if (frame && isARActive && hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          // FIXED: Full matrix update for smooth camera tracking
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrixDecompose(reticle.position, reticle.quaternion, reticle.scale); // Extract position/rotation
          reticle.updateMatrixWorld(true); // Force update
          reticle.visible = true;

          // Place dot on tap
          if (pendingPlacement) {
            pendingPlacement = false;
            placePoint(reticle.position.clone());
          }
        }
      } else {
        reticle.visible = false;
        if (pendingPlacement) {
          pendingPlacement = false;
          // Fallback position
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          const position = camera.position.clone().add(direction.multiplyScalar(0.6));
          placePoint(position);
        }
      }
    }
    renderer.render(scene, camera);
  });
}

function placePoint(position) {
  console.log('Dot placed at:', position); // Debug

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2 })
  );
  dot.position.copy(position);
  scene.add(dot);
  points.push(dot);

  lines.forEach(l => scene.remove(l));
  lines = [];
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const geom = new THREE.BufferGeometry().setFromPoints([points[i-1].position, points[i].position]);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 8 }));
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

  info.innerHTML = `<strong>${points.length} pts</strong><br>Total: <strong>${total.toFixed(3)} m</strong><br>Last: ${last} m<br><small>Double-tap reset</small>`;
}

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = []; lines = [];
  if (isARActive) info.textContent = 'Point & tap to place dot';
}
