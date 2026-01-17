const { clipboard } = require("electron");

// ---------- UI LOG ----------
const log = (msg) => {
  document.getElementById("log").innerText += msg + "\n";
};

// ---------- DEVICE ID ----------
const deviceId = crypto.randomUUID();
document.getElementById("device").innerText =
  "My Device ID: " + deviceId;

// ---------- WEBSOCKET ----------
const ws = new WebSocket("ws://localhost:8080");

let peerConnection = null;
let dataChannel = null;

// Register device with server
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "REGISTER_DEVICE",
    deviceId
  }));
  log("📡 Registered with signaling server");
};

// Handle signaling messages
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "OFFER") {
    await handleOffer(data);
  }

  if (data.type === "ANSWER") {
    log("📥 Answer received");
    await peerConnection.setRemoteDescription(data.answer);
  }

  if (data.type === "ICE") {
    await peerConnection.addIceCandidate(data.candidate);
  }
};

// ---------- CREATE PEER (CALLER) ----------
async function createPeer(to) {
  log("🔗 Creating peer connection to " + to);

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  dataChannel = peerConnection.createDataChannel("clipboard");

  dataChannel.onopen = () => {
    log("✅ DataChannel OPEN (connected)");
  };

  dataChannel.onmessage = (e) => {
    log("📥 Received: " + e.data);
  };

  peerConnection.onconnectionstatechange = () => {
    log("Connection state: " + peerConnection.connectionState);
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "ICE",
        to,
        candidate: e.candidate
      }));
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: "OFFER",
    to,
    offer
  }));

  log("📤 Offer sent");
}

// ---------- HANDLE OFFER (RECEIVER) ----------
async function handleOffer(data) {
  log("📥 Offer received from " + data.from);

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peerConnection.ondatachannel = (e) => {
    dataChannel = e.channel;

    dataChannel.onopen = () => {
      log("✅ DataChannel OPEN (connected)");
    };

    dataChannel.onmessage = (ev) => {
      log("📥 Received: " + ev.data);
    };
  };

  peerConnection.onconnectionstatechange = () => {
    log("Connection state: " + peerConnection.connectionState);
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "ICE",
        to: data.from,
        candidate: e.candidate
      }));
    }
  };

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: "ANSWER",
    to: data.from,
    answer
  }));

  log("📤 Answer sent");
}

// ---------- CLIPBOARD SYNC ----------
let lastText = "";

setInterval(() => {
  const text = clipboard.readText();

  if (
    text &&
    text !== lastText &&
    dataChannel &&
    dataChannel.readyState === "open"
  ) {
    lastText = text;
    dataChannel.send(text);
    log("📤 Sent clipboard: " + text);
  }
}, 1000);

// ---------- CONNECT BUTTON ----------
window.connect = () => {
  const peerId = document.getElementById("peerId").value;
  if (!peerId) return;
  createPeer(peerId);
};
