console.log("webrtc.js loaded");

let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

let pc;
let ws;

// ✔ Your FREE hosted signaling server
const SIGNALING_URL = "wss://srujan-signaling.onrender.com";

function createPeerConnection() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = stream;
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
}

async function startCall() {
  ws = new WebSocket(SIGNALING_URL);

  ws.onopen = async () => {
    createPeerConnection();
    await startCamera();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  };

  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "offer") {
      createPeerConnection();
      await startCamera();
      await pc.setRemoteDescription(data.offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "answer", answer }));
    }

    if (data.type === "answer") {
      await pc.setRemoteDescription(data.answer);
    }

    if (data.type === "candidate") {
      await pc.addIceCandidate(data.candidate);
    }
  };
}

window.startCall = startCall;
