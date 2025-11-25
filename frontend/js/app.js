import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];
let hitTestSource = null, session = null, referenceSpace = null;
let xrSession = null;

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

  window.onresize = () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
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
    xrSession = session;

    document.body.classList.add('ar-active');
    button.textContent = 'STOP AR';
    info.textContent = 'Tap anywhere to place dot';

    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);

    referenceSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: referenceSpace });

    // Start animation loop
    renderer.setAnimationLoop((time, frame) => animate(time, frame));

    session.addEventListener('end', () => {
      renderer.setAnimationLoop(null);
      session = null;
      xrSession = null;
      hitTestSource = null;
      referenceSpace = null;
      document.body.classList.remove('ar-active');
      button.textContent = 'START AR';
      info.textContent = 'Tap START AR to begin';
      resetAll();
    });

    // Add tap listener
    renderer.domElement.addEventListener('click', onScreenTap);
    
  } catch (err) {
    console.error('WebXR error:', err);
    info.textContent = 'WebXR failed: ' + err.message;
  }
}

function onScreenTap(e) {
  e.preventDefault();
  
  if (!xrSession || !renderer.xr.getFrame) {
    console.log('No active XR session');
    return;
  }

  try {
    const frame = renderer.xr.getFrame();
    if (!frame) {
      console.log('No frame available');
      return;
    }

    let hitPose = null;
    if (hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        hitPose = hits[0].getPose(referenceSpace);
      }
    }

    let position;
    if (hitPose) {
      position = new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().fromArray(hitPose.transform.matrix)
      );
      reticle.matrix.fromArray(hitPose.transform.matrix);
      reticle.visible = true;
    } else {
      // Fallback: place 1 meter in front of camera
      const dir = new THREE.Vector3(0, 0, -1);
      camera.getWorldDirection(dir);
      position = camera.position.clone().add(dir.multiplyScalar(1));
      reticle.visible = false;
    }

    placePoint(position);
    console.log('Point placed at:', position);
    
  } catch (err) {
    console.error('Tap error:', err);
  }
}

function animate(time, frame) {
  if (frame && hitTestSource && referenceSpace) {
    try {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(referenceSpace);
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;
      } else {
        reticle.visible = false;
      }
    } catch (err) {
      console.error('Hit test error:', err);
    }
  }
  renderer.render(scene, camera);
}

function placePoint(pos) {
  // Bright green sphere
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00
    })
  );
  dot.position.copy(pos);
  scene.add(dot);
  points.push(dot);
  console.log(`Point ${points.length} placed at:`, pos);

  // Rebuild all lines (connect each point to previous)
  lines.forEach(l => scene.remove(l));
  lines = [];
  
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          points[i-1].position, 
          points[i].position
        ]),
        new THREE.LineBasicMaterial({ 
          color: 0xffff00, 
          linewidth: 8,
          emissive: 0xffff00
        })
      );
      scene.add(line);
      lines.push(line);
    }
  }
  
  updateInfo();
}

function updateInfo() {
  if (!points.length) return;

  // Distance between consecutive points
  let total = 0;
  let distanceBreakdown = '';
  for (let i = 1; i < points.length; i++) {
    const segmentDist = points[i].position.distanceTo(points[i-1].position);
    total += segmentDist;
    distanceBreakdown += `P${i-1}→P${i}: ${segmentDist.toFixed(3)}m `;
  }

  // Distance from camera to each point
  let cameraDistances = '';
  for (let i = 0; i < points.length; i++) {
    const camDist = camera.position.distanceTo(points[i].position);
    cameraDistances += `Cam→P${i}: ${camDist.toFixed(3)}m `;
  }

  // Distance from first to last point (straight line)
  let firstToLast = '0.000';
  if (points.length > 1) {
    firstToLast = points[0].position.distanceTo(points[points.length-1].position).toFixed(3);
  }

  // Camera to first and last point
  let camToFirst = camera.position.distanceTo(points[0].position).toFixed(3);
  let camToLast = points.length > 1 
    ? camera.position.distanceTo(points[points.length-1].position).toFixed(3)
    : camToFirst;

  info.innerHTML = `
    <strong>📍 Points: ${points.length}</strong><br>
    <strong>📏 Total Path: ${total.toFixed(3)}m</strong><br>
    <strong>➡️ First→Last: ${firstToLast}m</strong><br>
    <strong>📹 Cam→First: ${camToFirst}m</strong><br>
    <strong>📹 Cam→Last: ${camToLast}m</strong><br>
    <hr>
    <small>Segments: ${distanceBreakdown}</small><br>
    <small>Camera Dists: ${cameraDistances}</small><br>
    <small>Double-tap to reset</small>
  `;
}

// Double-tap reset
let lastTapTime = 0;
document.body.addEventListener('touchend', () => {
  const now = Date.now();
  if (now - lastTapTime < 400) {
    resetAll();
    if (xrSession) info.textContent = 'Tap anywhere to place dot';
  }
  lastTapTime = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));
  points = [];
  lines = [];
  reticle.visible = false;
}
