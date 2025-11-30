// frontend/js/main.js
// Cross-platform web AR measurement:
// - WebXR (Three.js) + hit-test for Android/compatible browsers (real meters)
// - model-viewer fallback + manual measurement for iOS / non-WebXR (user places scaled model and taps)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/webxr/ARButton.js';

// UI
const distanceEl = document.getElementById('distance');
const resetBtn = document.getElementById('resetBtn');
const helpBtn = document.getElementById('helpBtn');
const openARBtn = document.getElementById('openARBtn');
const instructions = document.getElementById('instructions');

const mvContainer = document.getElementById('mv-fallback');
const modelViewer = document.getElementById('modelViewer');
const fallbackUI = document.getElementById('fallback-ui');
const startManualBtn = document.getElementById('startManual');
const placePointBtn = document.getElementById('placePoint');
const fallbackDistanceEl = document.getElementById('fallback-distance');

let usingWebXR = false;

/* ---------------------------
   Feature detect WebXR + hit-test
   --------------------------- */
async function detectWebXR() {
  if (navigator.xr && navigator.xr.isSessionSupported) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      return supported;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/* ---------------------------
   START: WebXR path (Three.js) - real meters (Android)
   --------------------------- */
let renderer, scene, camera, controller, reticle;
let hitTestSource = null, hitTestSourceRequested = false, referenceSpace = null;
let markers = [];

async function startWebXR() {
  usingWebXR = true;
  instructions.textContent = 'Starting AR (WebXR)...';
  // Setup three.js scene
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // reticle
  const geometry = new THREE.RingGeometry(0.04, 0.06, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x00FFAA });
  reticle = new THREE.Mesh(geometry, material);
  reticle.visible = false;
  scene.add(reticle);

  // controller
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelectXR);
  scene.add(controller);

  // ARButton
  const btn = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
  // ensure button doesn't duplicate if library appended one
  if (!document.body.contains(btn)) document.body.appendChild(btn);

  window.addEventListener('resize', onWindowResizeXR);
  renderer.setAnimationLoop(renderXR);

  instructions.textContent = 'Tap the AR button to enter AR, then tap on screen to place points.';
  distanceEl.textContent = 'Tap to place points';
}

function onWindowResizeXR() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSelectXR() {
  if (!reticle.visible) {
    // fallback: place in front of camera 1m
    const fallbackPos = new THREE.Vector3(0,0,-1).applyMatrix4(controller.matrixWorld);
    placeMarker(fallbackPos);
    return;
  }
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrixWorld);
  placeMarker(pos);
}

function placeMarker(pos) {
  if (markers.length >= 2) {
    clearMarkers();
  }
  const geo = new THREE.SphereGeometry(0.02, 16, 12);
  const mat = new THREE.MeshStandardMaterial({ color: markers.length === 0 ? 0xff0000 : 0x0000ff });
  const s = new THREE.Mesh(geo, mat);
  s.position.copy(pos);
  scene.add(s);
  markers.push(s);
  if (markers.length === 2) {
    const d = markers[0].position.distanceTo(markers[1].position);
    distanceEl.textContent = d.toFixed(3) + ' m';
  } else {
    distanceEl.textContent = 'Point placed: ' + markers.length;
  }
}

function clearMarkers() {
  markers.forEach(m => scene.remove(m));
  markers = [];
  distanceEl.textContent = 'Tap to place points';
}

function renderXR(timestamp, frame) {
  if (frame) {
    if (!referenceSpace) referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource && referenceSpace) {
      const hitResults = frame.getHitTestResults(hitTestSource);
      if (hitResults.length > 0) {
        const hit = hitResults[0];
        const pose = hit.getPose(referenceSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
}

/* ---------------------------
   FALLBACK: model-viewer manual flow (iOS / non-WebXR)
   ---------------------------

   Strategy:
   - Use <model-viewer> to let user place a **scaled** ruler model (1 unit = 1 meter),
     opened via Quick Look (iOS) or Scene Viewer (Android) when user taps "Open AR".
   - After user places the model, they can use manual "Place Point" taps: we record the screen x/y
     coordinates and convert them to distances by using the known scale & the model's projected size.
   - This is not as perfect as WebXR hit-test; it's a pragmatic fallback that works from a link.
   --------------------------- */

let manualMode = false;
let manualPoints = [];

function startManualFlow() {
  mvContainer.style.display = 'block';
  instructions.style.display = 'none';
  placePointBtn.disabled = false;
  startManualBtn.disabled = true;
  openARBtn.style.display = 'inline-block';
  distanceEl.textContent = 'Manual mode: place ruler then tap Place Point';
  fallbackDistanceEl.textContent = '—';
}

// When user taps "Place Point" we capture the screen tap coordinates and compute a rough distance
placePointBtn && placePointBtn.addEventListener('click', () => {
  instructions.style.display = 'none';
  alert('Now tap the AR view where you want to place a point (tap anywhere on the 3D preview). On iOS Quick Look open, you can tap "Done" and use this manual flow after placing the object.');
  // We enable a one-time click listener on the document to capture clientX/clientY
  const handler = (ev) => {
    const x = ev.clientX;
    const y = ev.clientY;
    manualPoints.push({x,y});
    alert('Point recorded. Points: ' + manualPoints.length);
    if (manualPoints.length >= 2) {
      // Use screen-space distance scaled by a known scale of ruler model.
      // Heuristic: measure pixel length of the placed ruler in viewport (user-visible). We can't access Quick Look internals,
      // so we assume the on-screen model represents 1 meter; we derive pxPerMeter by measuring the modelViewer bounding box.
      const rect = modelViewer.getBoundingClientRect();
      // approximate pxPerMeter using model-viewer width: assume model width occupies ~ rect.width * 0.5 at placed zoom.
      const pxPerMeter = rect.width * 0.5; // heuristic — user should align ruler horizontally for better accuracy
      const dx = manualPoints[0].x - manualPoints[1].x;
      const dy = manualPoints[0].y - manualPoints[1].y;
      const pxDist = Math.sqrt(dx*dx + dy*dy);
      const meters = pxDist / pxPerMeter;
      fallbackDistanceEl.textContent = meters.toFixed(3) + ' m (approx)';
      distanceEl.textContent = meters.toFixed(3) + ' m (approx)';
      manualPoints = [];
      document.removeEventListener('click', handler);
    } else {
      document.removeEventListener('click', handler);
    }
  };
  document.addEventListener('click', handler);
});

openARBtn.addEventListener('click', () => {
  // open model-viewer AR action (this triggers Quick Look on iOS or Scene Viewer on Android)
  modelViewer.showPoster = false;
  modelViewer.enterAR(); // modern model-viewer supports enterAR(); else user taps AR button in UI
});

// start manual flow
startManualBtn.addEventListener('click', startManualFlow);

/* ---------------------------
   Initialization: decide which route to use
   --------------------------- */
(async function init() {
  resetBtn.addEventListener('click', () => {
    if (usingWebXR) clearMarkers();
    else { manualPoints = []; fallbackDistanceEl.textContent = '—'; distanceEl.textContent = '—'; }
  });
  helpBtn.addEventListener('click', () => {
    alert('If your browser supports WebXR (Chrome Android), you will get a true AR measurement experience with meters. Otherwise the page falls back to model-viewer Quick Look/Scene Viewer and a manual measurement flow for iOS.');
  });

  const webxr = await detectWebXR();

  if (webxr) {
    instructions.textContent = 'WebXR supported — click the AR button to start (best on Chrome Android).';
    // start WebXR (adds renderer & AR button)
    startWebXR();
  } else {
    // fallback: model-viewer
    instructions.textContent = 'WebXR not available — using fallback (model-viewer). On iOS, tap the AR icon to open Quick Look.';
    // dynamically load model-viewer script
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    document.head.appendChild(s);
    // show fallback UI controls after model-viewer available
    s.onload = () => {
      mvContainer.style.display = 'block';
      fallbackUI.style.display = 'flex';
      openARBtn.style.display = 'inline-block';
      distanceEl.textContent = 'Fallback: open AR / use manual measure';
    };
  }
})();
