from flask import Flask
from flask_socketio import SocketIO, emit, join_room
from flask_compress import Compress
import eventlet
eventlet.monkey_patch() # ensures compatibility for WebSocket handling

# === Flask + SocketIO Setup ===
app = Flask(__name__)
Compress(app)

socketio = SocketIO(
    app,
     cors_allowed_origins="*",
     async_mode="eventlet",
     ping_interval=25, # keepalive interval (seconds)
     ping_timeout=60, # wait before closing dead connections
)

@app.route("/")
def home():
     """Health check endpoint for Render/Heroku"""
     return {"status": "ok", "message": "WebXR backend running 🚀"}

# === WebRTC Signaling Events ===
@socketio.on("join")
def on_join(room):
    join_room(room)
    print(f"👥 User joined room: {room}")
    emit("ready", room=room, include_self=False)

@socketio.on("offer")
def on_offer(data):
    print("📡 Received offer → forwarding")
    emit("offer", data["description"], room=data["room"], include_self=False)

@socketio.on("answer")
def on_answer(data):
    print("📡 Received answer → forwarding")
    emit("answer", data["description"], room=data["room"], include_self=False)

@socketio.on("candidate")
def on_candidate(data):
    print("🌐 Received ICE candidate → forwarding")
    emit("candidate", data["candidate"], room=data["room"], include_self=False)

# === Run Server ===
# This block is for local testing only. 
# It is commented out so Gunicorn (via the Procfile) can run the app in production.
# if __name__ == "__main__":
#     print("🚀 Starting Flask-SocketIO server on port 3000")
#     socketio.run(app, host="0.0.0.0", port=3000, debug=False, use_reloader=False)