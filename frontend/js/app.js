import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';

let camera, scene, renderer, reticle;
let points = [], lines = [];

let hitTestSource = null;
let latestXRFrame = null;
let session = null;

let viewerRefSpace = null;
let localFloorRefSpace = null;

const info = document.getElementById('info');
const button = document.getElementById('arButton');

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.03, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 8));

  button.onclick = startAR;

  // FIX: attach events to window (canvas is replaced during AR)
  window.addEventListener("touchend", onTap, false);
  window.addEventListener("pointerdown", onTap, false);
  window.addEventListener("click", onTap, false);

  window.onresize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
}

async function startAR() {
  console.log("START AR clicked!");

  if (session) {
    session.end();
    return;
  }

  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["local-floor", "dom-overlay"],
      domOverlay: { root: document.body }
    });

    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);

    viewerRefSpace = await session.requestReferenceSpace("viewer");
    localFloorRefSpace = await session.requestReferenceSpace("local-floor");

    hitTestSource = await session.requestHitTestSource({ space: viewerRefSpace });

    document.body.classList.add("ar-active");
    button.textContent = "STOP AR";
    info.textContent = "Tap anywhere to place point";

    renderer.setAnimationLoop(animate);

    session.addEventListener("end", () => {
      renderer.setAnimationLoop(null);
      resetAll();

      hitTestSource = null;
      latestXRFrame = null;
      session = null;

      document.body.classList.remove("ar-active");
      button.textContent = "START AR";
      info.textContent = "Tap START AR to begin";
    });

  } catch (e) {
    console.error("AR Error:", e);
    info.textContent = "AR failed: " + e.message;
  }
}

// MAIN RENDER LOOP — stores latest XRFrame
function animate(time, xrFrame) {
  if (xrFrame) latestXRFrame = xrFrame;

  if (xrFrame && hitTestSource && localFloorRefSpace) {
    const hits = xrFrame.getHitTestResults(hitTestSource);

    if (hits.length > 0) {
      const pose = hits[0].getPose(localFloorRefSpace);

      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;
      }
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

function onTap(e) {
  e.preventDefault();

  if (!session) return;

  const frame = latestXRFrame;
  if (!frame) {
    console.warn("No XRFrame yet");
    return;
  }

  let position = new THREE.Vector3();

  if (hitTestSource && localFloorRefSpace) {
    const hits = frame.getHitTestResults(hitTestSource);

    if (hits.length > 0) {
      const pose = hits[0].getPose(localFloorRefSpace);

      if (pose) {
        position.setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));

        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;
      }
    } else {
      // fallback
      let dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      position = camera.position.clone().add(dir.multiplyScalar(0.6));
      reticle.visible = false;
    }
  }

  placePoint(position);
}

function placePoint(pos) {
  console.log("Placing dot at:", pos);

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

  // Remove old lines
  lines.forEach(l => scene.remove(l));
  lines = [];

  // Draw new lines
  if (points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          points[i-1].position,
          points[i].position
        ]),
        new THREE.LineBasicMaterial({ color: 0xffff00 })
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
  for (let i = 1; i < points.length; i++) {
    total += points[i].position.distanceTo(points[i-1].position);
  }

  const last = points.length > 1
    ? points[points.length - 1].position.distanceTo(points[points.length - 2].position).toFixed(3)
    : "0.000";

  info.innerHTML = `
    <strong>${points.length} pts</strong><br>
    Total: <strong>${total.toFixed(3)} m</strong><br>
    Last: ${last} m<br>
    <small>Double-tap to reset</small>
  `;
}

// Double tap reset
let lastTap = 0;
document.body.addEventListener("touchend", () => {
  const now = Date.now();
  if (now - lastTap < 400) resetAll();
  lastTap = now;
});

function resetAll() {
  points.forEach(p => scene.remove(p));
  lines.forEach(l => scene.remove(l));

  points = [];
  lines = [];

  reticle.visible = false;

  if (session) info.textContent = "Tap anywhere to place point";
}
