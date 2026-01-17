const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

// deviceId -> ws
const devices = new Map();

wss.on("connection", (ws) => {
  let deviceId = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // 1️⃣ Register device
    if (data.type === "REGISTER_DEVICE") {
      deviceId = data.deviceId;
      devices.set(deviceId, ws);
      console.log("✅ Registered device:", deviceId);
      return;
    }

    // 2️⃣ Forward signaling messages
    if (data.to && devices.has(data.to)) {
      devices.get(data.to).send(JSON.stringify({
        ...data,
        from: deviceId
      }));
    }
  });

  ws.on("close", () => {
    if (deviceId) {
      devices.delete(deviceId);
      console.log("❌ Disconnected:", deviceId);
    }
  });
});

console.log("🚀 Signaling server running on ws://localhost:8080");
