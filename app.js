// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, push, onChildAdded, set, get, query, limitToLast, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

/* ==================== INIT ==================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ==================== ESTADO ==================== */
let currentUser = null;
let cryptoKey = null;
let nickname = "";
let virtualId = "";
const ROOM = "lobby";

/* ==================== DOM ==================== */
const $ = (id) => document.getElementById(id);
const screens = {
  loading: $("screen-loading"),
  setup:   $("screen-setup"),
  chat:    $("screen-chat"),
};
function show(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

/* ==================== ID VIRTUAL ==================== */
function generateVirtualId() {
  const part = () => Math.floor(1000 + Math.random() * 9000);
  return `GH-${part()}-${part()}`;
}

/* ==================== CRIPTOGRAFIA AES-GCM ==================== */
const SALT = new TextEncoder().encode("ghost-chat-salt-v1-fixed");

async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );
  return {
    iv:   btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(data))),
  };
}

async function decrypt(payload, key) {
  try {
    const iv   = Uint8Array.from(atob(payload.iv),   c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return "🔒 [mensagem ilegível — chave diferente]";
  }
}

/* ==================== AUTH ==================== */
signInAnonymously(auth).catch(err => {
  console.error("Erro no login anônimo:", err);
  $("screen-loading").innerHTML += `<p class="error">Falha: ${err.message}</p>`;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { show("loading"); return; }
  currentUser = user;

  const snap = await get(ref(db, `users/${user.uid}`));
  if (snap.exists()) {
    const data = snap.val();
    virtualId = data.virtualId || generateVirtualId();
    nickname  = data.nickname  || "";
    $("virtual-id").textContent = virtualId;
    if (nickname) $("input-nickname").value = nickname;
    $("input-passphrase").focus();
  } else {
    virtualId = generateVirtualId();
    $("virtual-id").textContent = virtualId;
  }
  show("setup");
});

/* ==================== SETUP ==================== */
$("btn-regen-id").addEventListener("click", () => {
  virtualId = generateVirtualId();
  $("virtual-id").textContent = virtualId;
});

$("btn-enter").addEventListener("click", async () => {
  const nick = $("input-nickname").value.trim();
  const pass = $("input-passphrase").value;
  const err  = $("setup-error");

  if (nick.length < 2) return err.textContent = "Apelido muito curto.";
  if (pass.length < 6) return err.textContent = "Senha deve ter no mínimo 6 caracteres.";
  err.textContent = "";

  nickname = nick;
  try {
    cryptoKey = await deriveKey(pass);
  } catch (e) {
    return err.textContent = "Erro ao gerar chave criptográfica.";
  }

  await set(ref(db, `users/${currentUser.uid}`), {
    virtualId,
    nickname,
    createdAt: Date.now(),
  });

  $("header-id").textContent = virtualId;
  enterChat();
});

$("input-passphrase").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-enter").click();
});

/* ==================== CHAT ==================== */
function enterChat() {
  show("chat");
  loadMessages();
}

function loadMessages() {
  const messagesEl = $("messages");
  messagesEl.innerHTML = "";

  const msgsRef = query(ref(db, `rooms/${ROOM}/messages`), limitToLast(100));

  onChildAdded(msgsRef, async (snap) => {
    const msg = snap.val();
    if (!msg) return;

    const isMine = msg.senderId === currentUser.uid;
    const text = msg.encrypted && msg.iv
      ? await decrypt({ iv: msg.iv, data: msg.encrypted }, cryptoKey)
      : "[formato inválido]";

    const el = document.createElement("div");
    el.className = `msg ${isMine ? "out" : "in"}`;
    el.innerHTML = `
      <span class="meta">${escapeHtml(msg.senderVirtualId || "???")}</span>
      <span class="body">${escapeHtml(text)}</span>
      <span class="time">${formatTime(msg.timestamp)}</span>
    `;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

async function sendMessage() {
  const input = $("message-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const enc = await encrypt(text, cryptoKey);
  await push(ref(db, `rooms/${ROOM}/messages`), {
    encrypted: enc.data,
    iv: enc.iv,
    senderId: currentUser.uid,
    senderVirtualId: virtualId,
    timestamp: serverTimestamp(),
  });
}

$("send-button").addEventListener("click", sendMessage);
$("message-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

$("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

/* ==================== UTILS ==================== */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }
