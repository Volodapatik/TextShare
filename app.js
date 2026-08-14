"use strict";

const $ = (id) => document.getElementById(id);

const SUPABASE_URL = "https://kbxjvegqehfcnecjsfip.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtieGp2ZWdxZWhmY25lY2pzZmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDMyMjcsImV4cCI6MjEwMjI3OTIyN30.2J5z10ZC0QXFw-C-53L7tvtpZl7YCxwW8ifjMW7msH8";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let peer = null;
let conn = null;
let isHost = false;
let currentRoom = null;
let mySenderId = null;
let scanStream = null;
let scanRAF = null;

function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screen).classList.add("active");
}

function toast(msg, ms = 2500) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), ms);
}

function createPeer(id) {
  return new Promise((resolve, reject) => {
    const p = new Peer(id, {
      debug: 0,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      }
    });
    p.on("open", () => resolve(p));
    p.on("error", reject);
  });
}

function addMessage(text, mine, fromHistory = false) {
  const box = $("messages");
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "theirs");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = mine ? "Ти" : "Інший пристрій";
  div.appendChild(meta);

  const body = document.createElement("div");
  body.textContent = text;
  div.appendChild(body);

  const btn = document.createElement("button");
  btn.className = "btn secondary small";
  btn.textContent = "Копіювати";
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Скопійовано");
    } catch {
      toast("Не вдалося скопіювати");
    }
  };
  div.appendChild(btn);

  box.appendChild(div);
  if (!fromHistory) box.scrollTop = box.scrollHeight;
}

async function loadHistory(roomId) {
  const { data, error } = await supabase
    .from("messages")
    .select("text, sender, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error(error);
    return;
  }

  $("messages").innerHTML = "";
  (data || []).forEach((m) => {
    addMessage(m.text, m.sender === mySenderId, true);
  });
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function saveMessage(roomId, text, sender) {
  const { error } = await supabase.from("messages").insert({
    room_id: roomId,
    text,
    sender
  });
  if (error) console.error("save error", error);
}

function setupConn(c) {
  conn = c;
  c.on("open", async () => {
    $("status").textContent = "Підключено ✅";
    $("qrWrap").classList.add("hidden");
    $("roomHint").classList.add("hidden");
    $("chatArea").classList.remove("hidden");
    toast("З’єднано");
    await loadHistory(currentRoom);
  });

  c.on("data", (data) => {
    if (data && data.type === "text" && typeof data.text === "string") {
      addMessage(data.text, false);
    }
  });

  c.on("close", () => {
    $("status").textContent = "З’єднання розірвано";
    toast("Відключено");
  });

  c.on("error", () => toast("Помилка з’єднання"));
}

$("btnCreate").onclick = async () => {
  show("room");
  isHost = true;
  $("status").textContent = "Створення кімнати…";
  $("chatArea").classList.add("hidden");
  $("qrWrap").classList.remove("hidden");
  $("roomHint").classList.remove("hidden");
  $("messages").innerHTML = "";

  try {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    peer = await createPeer(id);
    currentRoom = peer.id;
    mySenderId = "host-" + peer.id;
    $("roomCode").textContent = peer.id;
    $("status").textContent = "Очікуємо підключення…";

    QRCode.toCanvas($("qrCanvas"), peer.id, {
      width: 180,
      margin: 1,
      color: { dark: "#000", light: "#fff" }
    });

    peer.on("connection", (c) => setupConn(c));
  } catch (e) {
    $("status").textContent = "Помилка: " + e.message;
  }
};

$("btnJoin").onclick = () => join($("joinCode").value.trim().toUpperCase());
$("joinCode").onkeydown = (e) => {
  if (e.key === "Enter") join($("joinCode").value.trim().toUpperCase());
};

async function join(code) {
  if (!code) return toast("Введіть код");

  show("room");
  isHost = false;
  currentRoom = code;
  mySenderId = "guest-" + Math.random().toString(36).slice(2, 8);
  $("status").textContent = "Підключення…";
  $("roomCode").textContent = code;
  $("qrWrap").classList.add("hidden");
  $("roomHint").classList.add("hidden");
  $("chatArea").classList.add("hidden");
  $("messages").innerHTML = "";

  try {
    peer = await createPeer();
    const c = peer.connect(code, { reliable: true });
    setupConn(c);
  } catch (e) {
    $("status").textContent = "Помилка: " + e.message;
  }
}

// ---------- QR SCANNER ----------
$("btnScanQR").onclick = startScan;
$("btnStopScan").onclick = stopScan;

async function startScan() {
  show("scanner");
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    const video = $("scanVideo");
    video.srcObject = scanStream;
    await video.play();
    scanRAF = requestAnimationFrame(scanLoop);
  } catch (e) {
    toast("Немає доступу до камери: " + e.message);
    show("home");
  }
}

function stopScan() {
  if (scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if (scanStream) {
    scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
  }
  show("home");
}

function scanLoop() {
  if (!scanStream) return;
  const video = $("scanVideo");
  const canvas = $("scanCanvas");
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    if (code && code.data) {
      const val = code.data.trim().toUpperCase();
      if (val.length >= 4) {
        stopScan();
        join(val);
        return;
      }
    }
  }
  scanRAF = requestAnimationFrame(scanLoop);
}

$("btnSend").onclick = sendText;
$("textInput").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
};

async function sendText() {
  const text = $("textInput").value;
  if (!text.trim()) return;
  if (!conn || !conn.open) return toast("Немає з’єднання");

  conn.send({ type: "text", text });
  addMessage(text, true);
  $("textInput").value = "";
  $("textInput").focus();

  // Зберігаємо в Supabase
  if (currentRoom) {
    await saveMessage(currentRoom, text, mySenderId);
  }
}

$("btnBack").onclick = () => {
  stopScan();
  if (conn) try { conn.close(); } catch (_) {}
  if (peer) try { peer.destroy(); } catch (_) {}
  conn = null;
  peer = null;
  currentRoom = null;
  show("home");
};

show("home");
