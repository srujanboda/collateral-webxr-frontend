// webrtc.js — signaling for Flask-SocketIO backend

// ⚠️ ACTION REQUIRED: REPLACE THIS WITH YOUR DEPLOYED BACKEND URL (HTTPS/WSS)
const BACKEND_URL = "https://YOUR-DEPLOYED-BACKEND-URL-HERE.com";
const socket = io(BACKEND_URL, {
  transports: ["websocket"], // faster startup
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

let localStream;
let peerConnection;
let roomName = "default-room"; // can randomize for multiple sessions

// STUN configuration (Google public)
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// === INIT ===
export async function initWebRTC(videoElementId = "videoFeed") {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    const localVideo = document.getElementById(videoElementId);
    localVideo.srcObject = localStream;
    localVideo.style.display = "block";
    console.log("✅ Local stream ready");
  } catch (err) {
    console.error("Error accessing camera:", err);
  }

  // Join signaling room
  socket.emit("join", roomName);
  console.log("📡 Joined signaling room:", roomName);

  // Basic connection check
  socket.on("connect", () => console.log("🔌 Connected to signaling server"));
  socket.on("connect_error", (err) => console.error("⚠️ Socket error:", err));
  socket.on("disconnect", (reason) => console.warn("Socket disconnected:", reason));

  // When another peer joins
  socket.on("ready", async () => {
    console.log("👥 Peer is ready, creating offer...");
    createPeerConnection();
    addLocalTracks();

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", { description: offer, room: roomName });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  });

  // When offer is received
  socket.on("offer", async (description) => {
    console.log("📩 Offer received");
    createPeerConnection();
    addLocalTracks();

    try {
      await peerConnection.setRemoteDescription(description);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { description: answer, room: roomName });
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  });

  // When answer is received
  socket.on("answer", async (description) => {
    console.log("📩 Answer received");
    try {
      await peerConnection.setRemoteDescription(description);
    } catch (err) {
      console.error("Error setting remote description:", err);
    }
  });

  // ICE candidates
  socket.on("candidate", async (candidate) => {
    if (peerConnection && candidate) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  });

  // Handle cleanup on window unload
  window.addEventListener("beforeunload", cleanup);
}

// === Helper Functions ===

function createPeerConnection() {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", { candidate: event.candidate, room: roomName });
    }
  };

  peerConnection.ontrack = (event) => {
    let remoteVideo = document.getElementById("remoteVideo");
    if (!remoteVideo) {
      remoteVideo = document.createElement("video");
      remoteVideo.id = "remoteVideo";
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      Object.assign(remoteVideo.style, {
        position: "absolute",
        top: "0",
        right: "0",
        width: "30%",
        border: "2px solid white",
        zIndex: "9999",
      });
      document.body.appendChild(remoteVideo);
    }
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.style.display = "block";
  };
}

function addLocalTracks() {
  if (!localStream || !peerConnection) return;
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
}

function cleanup() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  socket.disconnect();
  console.log("🧹 WebRTC session cleaned up.");
}
