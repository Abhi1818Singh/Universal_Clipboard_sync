const { clipboard } = require("electron");

/* ---------- LOG UI (WHITESPACE SAFE) ---------- */
const log = (msg, type = "sent") => {
  const logDiv = document.getElementById("log");
  const time = new Date().toLocaleTimeString();

  const item = document.createElement("div");
  item.className = `log-item ${type}`;

  item.innerHTML = `
    <div style="white-space: pre-wrap; word-break: break-word;">
${msg}
    </div>
    <div class="log-time">${time}</div>
  `;

  logDiv.prepend(item);
};

/* ---------- DEVICE ID ---------- */
const deviceId = crypto.randomUUID();
document.getElementById("device").innerText =
  "My Device ID: " + deviceId;

/* ---------- WEBSOCKET ---------- */
const ws = new WebSocket("ws://localhost:8080");

let peerConnection = null;
let dataChannel = null;

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "REGISTER_DEVICE",
    deviceId
  }));
  log("📡 Registered with signaling server", "sent");
};

/* ---------- SIGNALING ---------- */
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "OFFER") {
    await handleOffer(data);
  }

  if (data.type === "ANSWER") {
    log("📥 Answer received", "received");
    await peerConnection.setRemoteDescription(data.answer);
  }

  if (data.type === "ICE") {
    await peerConnection.addIceCandidate(data.candidate);
  }

  if (data.type === "PAIR_CODE") {
    log(`🔑 Pair Code:\n${data.code}`, "sent");
  }

  if (data.type === "AUTO_CONNECT") {
    createPeer(data.from);
  }
};

/* ---------- CREATE PEER ---------- */
async function createPeer(to) {
  log(`🔗 Connecting to device:\n${to}`, "sent");

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  dataChannel = peerConnection.createDataChannel("clipboard");

  dataChannel.onopen = () => {
    log("✅ DataChannel connected", "sent");
  };

  dataChannel.onmessage = (e) => {
    log(`📥 Received:\n${e.data}`, "received");
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

  log("📤 Offer sent", "sent");
}

/* ---------- HANDLE OFFER ---------- */
async function handleOffer(data) {
  log(`📥 Offer received from:\n${data.from}`, "received");

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peerConnection.ondatachannel = (e) => {
    dataChannel = e.channel;

    dataChannel.onopen = () => {
      log("✅ DataChannel connected", "sent");
    };

    dataChannel.onmessage = (ev) => {
      log(`📥 Received:\n${ev.data}`, "received");
    };
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

  log("📤 Answer sent", "sent");
}

/* ---------- CLIPBOARD SYNC ---------- */
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
    log(`📤 Sent clipboard:\n${text}`, "sent");
  }
}, 1000);

/* ---------- UI ACTIONS ---------- */
window.connect = () => {
  const peerId = document.getElementById("peerId").value;
  if (!peerId) return;
  createPeer(peerId);
};

window.generateCode = () => {
  ws.send(JSON.stringify({ type: "GENERATE_PAIR_CODE" }));
};

window.joinCode = () => {
  const code = document.getElementById("pairCode").value;
  ws.send(JSON.stringify({
    type: "JOIN_PAIR_CODE",
    code
  }));
};
