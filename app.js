"use strict";

const $ = (id) => document.getElementById(id);

let peer = null;
let conn = null;
let isHost = false;

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

function addMessage(text, mine) {
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
  box.scrollTop = box.scrollHeight;
}

function setupConn(c) {
  conn = c;
  c.on("open", () => {
    $("status").textContent = "Підключено ✅";
    $("qrWrap").classList.add("hidden");
    $("roomHint").classList.add("hidden");
    $("chatArea").classList.remove("hidden");
    toast("З’єднано");
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

$("btnJoin").onclick = join;
$("joinCode").onkeydown = (e) => { if (e.key === "Enter") join(); };

async function join() {
  const code = $("joinCode").value.trim().toUpperCase();
  if (!code) return toast("Введіть код");

  show("room");
  isHost = false;
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

$("btnSend").onclick = sendText;
$("textInput").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
};

function sendText() {
  const text = $("textInput").value;
  if (!text.trim()) return;
  if (!conn || !conn.open) return toast("Немає з’єднання");

  conn.send({ type: "text", text });
  addMessage(text, true);
  $("textInput").value = "";
  $("textInput").focus();
}

$("btnBack").onclick = () => {
  if (conn) try { conn.close(); } catch (_) {}
  if (peer) try { peer.destroy(); } catch (_) {}
  conn = null;
  peer = null;
  show("home");
};

show("home");
