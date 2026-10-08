import {
  signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref, set, get, update, push, remove, onValue, onChildAdded,
  query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { auth, db, state, LS } from "./store.js";
import {
  generateKeyPair, importPrivate, importPublic,
  deriveSharedKey, deriveGroupKey, encrypt, decrypt,
  generateGhostId, randomId
} from "./crypto.js";
import { fileToDataUrl, startVoiceRecording } from "./media.js";
import {
  startCall, acceptCall, rejectCall, endCall,
  toggleMic, toggleCam, listenIncomingCalls, CallEvents
} from "./calls.js";
import {
  createCommunity, joinCommunity, createSubgroup,
  addMemberToChat, banMember, promoteToAdmin,
  leaveChat, subscribeCommunities
} from "./communities.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function withTimeout(promise, ms = 9000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("Tempo limite de conexão com o Firebase."), { code: "timeout" })), ms))
  ]);
}

/* ============ SCREENS ============ */
function show(name) {
  $$(".screen").forEach(s => s.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
}

/* ============ LOGIN ============ */
let creatingAccount = false;
let pendingGhostId = generateGhostId();
$("#login-ghostid").textContent = pendingGhostId;
$("#btn-regen").onclick = () => {
  pendingGhostId = generateGhostId();
  $("#login-ghostid").textContent = pendingGhostId;
};

$("#btn-login").onclick = async () => {
  const username = $("#login-username").value.trim();
  const err = $("#login-error");
  err.textContent = "";
  if (username.length < 2) return err.textContent = "Nome muito curto.";
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return err.textContent = "Use apenas letras, números, _ . -";

  show("loading");
  $("#loading-msg").textContent = "Criando identidade…";

  try {
    creatingAccount = true;
    const { publicJwk, privateJwk } = await generateKeyPair();
    LS.set("privJwk", privateJwk);
    LS.set("pubJwk",  publicJwk);
    LS.set("ghostId", pendingGhostId);

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const idSnap = await withTimeout(get(ref(db, `ghostIds/${pendingGhostId}`)));
    if (idSnap.exists()) {
      pendingGhostId = generateGhostId();
      $("#login-ghostid").textContent = pendingGhostId;
    }

    await set(ref(db, `users/${uid}`), {
      ghostId: pendingGhostId,
      username, nickname: username,
      bio: "", avatar: "", banner: "",
      publicJwk: JSON.stringify(publicJwk),
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });
    await set(ref(db, `ghostIds/${pendingGhostId}`), uid);
    creatingAccount = false;
    location.reload();
  } catch (e) {
    creatingAccount = false;
    console.error(e);
    show("login");
    const code = e?.code || "";
    err.textContent = code.includes("operation-not-allowed") ? "A autenticação anônima está desativada no Firebase. Ative o provedor Anonymous no console do projeto." : code.includes("permission-denied") ? "O Firebase recusou o acesso ao banco. Revise as regras do Realtime Database." : "Não foi possível criar sua conta agora. Tente novamente.";
  }

};

/* ============ BOOT ============ */
onAuthStateChanged(auth, async (user) => {
  if (!user) { show("login"); return; }
  state.user = user;

  show("loading");
  $("#loading-msg").textContent = "Carregando perfil…";

  let snap;
  try {
    snap = await withTimeout(get(ref(db, `users/${user.uid}`)));
  } catch (e) {
    console.error("Falha ao carregar perfil", e);
    show("login");
    $("#login-error").textContent = e.code === "timeout" ? "O Firebase não respondeu. Confira a conexão e tente novamente." : "Não foi possível carregar seu perfil.";
    return;
  }
  if (!snap.exists()) { if (creatingAccount) return; await signOut(auth); return; }
  state.profile = snap.val();

  const privJwk = LS.get("privJwk");
  if (privJwk) {
    state.privateKey = await importPrivate(privJwk);
    state.publicJwk  = JSON.parse(state.profile.publicJwk);
  }

  state.settings = LS.get("settings", { wallpaper: "" });
  if (state.settings.wallpaper) {
    document.documentElement.style.setProperty("--wall", `url(${state.settings.wallpaper})`);
  }

  onValue(ref(db, `users/${user.uid}`), s => {
    state.profile = s.val(); renderMe();
  });
  update(ref(db, `users/${user.uid}`), { lastSeen: Date.now() });

  await bootApp();
  show("app");
});

function renderMe() {
  $("#me-nick").textContent = state.profile.nickname || state.profile.username;
  $("#me-id").textContent   = state.profile.ghostId;
  $("#me-avatar").src = state.profile.avatar || avatarFallback(state.profile.nickname || state.profile.username);
}
function avatarFallback(name) {
  const ch = (name || "?").slice(0, 1).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#1a1a25'/><text x='32' y='42' font-size='28' text-anchor='middle' fill='#f0f0f5' font-family='sans-serif'>${ch}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ============ BOOT APP ============ */
async function bootApp() {
  renderMe();
  wireTabs();
  wireNewMenu();
  wireSettings();
  wireEmoji();
  wireComposer();
  wireBack();
  wireAttach();
  wireCalls();
  wireConvHeader();

  subscribeContacts();
  subscribeChats();
  subscribeCommunities(state.user.uid, () => renderList());
  listenIncomingCalls(state.user.uid, showIncomingToast);
}

function wireTabs() {
  $$(".tab").forEach(t => t.onclick = () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.currentTab = t.dataset.tab;
    renderList();
  });
  state.currentTab = "chats";
  $("#chat-search")?.addEventListener("input", renderList);
  renderList();
}

function wireBack() {
  $("#btn-back").onclick = () => {
    document.body.classList.remove("has-conv");
    state.activeChat = null;
    renderList();
  };
}

/* ============ CONTATOS ============ */
function subscribeContacts() {
  const uid = state.user.uid;
  onValue(ref(db, `contacts/${uid}`), async (snap) => {
    const raw = snap.val() || {};
    state.contacts = {};
    for (const [cid, val] of Object.entries(raw)) {
      const pSnap = await get(ref(db, `users/${cid}`));
      if (pSnap.exists()) state.contacts[cid] = { alias: val.alias || "", profile: pSnap.val() };
    }
    renderList();
  });
}

async function addContactByGhostId(ghostId, alias) {
  const idSnap = await get(ref(db, `ghostIds/${ghostId}`));
  if (!idSnap.exists()) throw new Error("ID não encontrado.");
  const cid = idSnap.val();
  if (cid === state.user.uid) throw new Error("Esse é você!");
  await set(ref(db, `contacts/${state.user.uid}/${cid}`), { alias: alias || "", addedAt: Date.now() });
  return cid;
}

/* ============ CHATS ============ */
function directChatId(a, b) { return "d_" + [a, b].sort().join("_"); }

function subscribeChats() {
  const uid = state.user.uid;
  onValue(ref(db, "chats"), (snap) => {
    const all = snap.val() || {};
    state.chats = {};
    for (const [cid, chat] of Object.entries(all)) {
      if (chat.members && chat.members[uid]) state.chats[cid] = chat;
    }
    renderList();
  });
}

async function ensureDirectChat(otherUid) {
  const cid = directChatId(state.user.uid, otherUid);
  const s = await get(ref(db, `chats/${cid}`));
  if (!s.exists()) {
    await set(ref(db, `chats/${cid}`), {
      type: "direct",
      members: { [state.user.uid]: true, [otherUid]: true },
      createdAt: Date.now(),
    });
  }
  return cid;
}

async function createGroup(name, memberUids, avatar = "", communityId = null) {
  const cid = "g_" + randomId(12);
  const members = { [state.user.uid]: true };
  memberUids.forEach(u => members[u] = true);
  const data = {
    type: "group", name, avatar, members,
    admins: { [state.user.uid]: true },
    owner: state.user.uid,
    createdAt: Date.now(),
  };
  if (communityId) data.communityId = communityId;
  await set(ref(db, `chats/${cid}`), data);
  return cid;
}

async function createChannel(name, desc = "", communityId = null) {
  const cid = "c_" + randomId(12);
  const data = {
    type: "channel", name, desc,
    members: { [state.user.uid]: true },
    admins: { [state.user.uid]: true },
    owner: state.user.uid,
    createdAt: Date.now(),
  };
  if (communityId) data.communityId = communityId;
  await set(ref(db, `chats/${cid}`), data);
  return cid;
}

async function joinByInviteCode(code) {
  const s = await get(ref(db, `invites/${code}`));
  if (!s.exists()) throw new Error("Convite inválido.");
  const { chatId } = s.val();
  const chatSnap = await get(ref(db, `chats/${chatId}`));
  const chat = chatSnap.val();
  if (chat?.banned && chat.banned[state.user.uid]) throw new Error("Você foi banido.");
  await update(ref(db, `chats/${chatId}/members`), { [state.user.uid]: true });
  return chatId;
}

async function createInvite(chatId) {
  const code = randomId(8);
  await set(ref(db, `invites/${code}`), {
    chatId, createdBy: state.user.uid, createdAt: Date.now(),
  });
  return code;
}

/* ============ RENDER LIST ============ */
function renderList() {
  const el = $("#list");
  el.innerHTML = "";
  const term = ($("#chat-search")?.value || "").trim().toLowerCase();
  const tab = state.currentTab || "chats";

  if (tab === "contacts") {
    const entries = Object.entries(state.contacts);
    if (!entries.length) return el.innerHTML = emptyMsg("Nenhum contato. Toque em +.");
    for (const [uid, { alias, profile }] of entries) {
      el.appendChild(itemEl({
        img: profile.avatar || avatarFallback(profile.nickname || profile.username),
        title: alias || profile.nickname || profile.username,
        sub: profile.ghostId,
        onclick: () => openDirectChat(uid),
      }));
    }
    return;
  }

  if (tab === "communities") {
    const entries = Object.entries(state.communities);
    if (!entries.length) return el.innerHTML = emptyMsg("Sem comunidades. Toque em +.");
    for (const [cid, cm] of entries) {
      const subs = Object.values(state.chats).filter(c => c.communityId === cid).length;
      el.appendChild(itemEl({
        img: cm.avatar || avatarFallback(cm.name),
        title: cm.name,
        sub: `${subs} subgrupo(s) · ${Object.keys(cm.members).length} membros`,
        onclick: () => openCommunity(cid),
      }));
    }
    return;
  }

  const list = Object.entries(state.chats).filter(([cid, c]) => {
    const title = c.type === "direct" ? directTitle(c) : c.name;
    return (c.type === "direct" || (!c.communityId && (c.type === "group" || c.type === "channel"))) && (!term || `${title} ${cid}`.toLowerCase().includes(term));
  });
  list.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if (!list.length) return el.innerHTML = emptyMsg("Vazio. Toque em +.");
  for (const [cid, chat] of list) {
    const title = chat.type === "direct" ? directTitle(chat) : chat.name;
    el.appendChild(itemEl({
      img: chat.avatar || avatarFallback(title),
      title,
      sub: chat.type === "group" ? "Grupo" : chat.type === "channel" ? "Canal" : "Conversa",
      active: state.activeChat === cid,
      onclick: () => openChat(cid),
    }));
  }
}
function emptyMsg(t) { return `<p style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px">${t}</p>`; }
function itemEl({ img, title, sub, onclick, active }) {
  const d = document.createElement("div");
  d.className = "item" + (active ? " active" : "");
  d.innerHTML = `<img class="avatar" src="${img}"><div class="info"><strong></strong><small></small></div>`;
  d.querySelector("strong").textContent = title;
  d.querySelector("small").textContent = sub;
  d.onclick = onclick;
  return d;
}
function directTitle(chat) {
  const other = Object.keys(chat.members).find(u => u !== state.user.uid);
  const c = state.contacts[other];
  return (c?.alias) || c?.profile.nickname || c?.profile.username || "Desconhecido";
}

/* ============ OPEN CHAT ============ */
async function openDirectChat(otherUid) {
  const cid = await ensureDirectChat(otherUid);
  openChat(cid);
}

let unsubMessages = null;

async function openChat(cid) {
  state.activeChat = cid;
  state.activeCommunity = null;
  const chat = state.chats[cid];
  if (!chat) return;
  document.body.classList.add("has-conv");
  $("#empty").style.display = "none";
  $("#conv").hidden = false;

  const title = chat.type === "direct" ? directTitle(chat) : chat.name;
  $("#conv-name").textContent = title;
  $("#conv-avatar").src = chat.avatar || avatarFallback(title);
  $("#conv-sub").textContent =
    chat.type === "direct" ? "Criptografia de ponta a ponta" :
    chat.type === "group"  ? `${Object.keys(chat.members).length} membros` :
    "Canal";

  renderList();
  await renderMessages(cid);
}

async function openCommunity(cid) {
  state.activeCommunity = cid;
  const cm = state.communities[cid];
  if (!cm) return;

  const subs = Object.entries(state.chats).filter(([, c]) => c.communityId === cid);

  const bg = modal({
    title: cm.name,
    hideCancel: true, okText: "Fechar",
    bodyHtml: `
      <p class="dim">${cm.desc || ""}</p>
      <button class="primary" data-act="new-sub">Criar subgrupo/canal</button>
      <button class="primary" data-act="invite">Gerar convite</button>
      <div style="margin-top:8px"><strong>Subgrupos e canais</strong></div>
      <div id="subs"></div>
    `,
    onOk: () => true,
  });

  bg.querySelector(".modal-body").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    document.querySelector(".modal-bg")?.remove();
    if (b.dataset.act === "new-sub") newSubgroupModal(cid);
    if (b.dataset.act === "invite") {
      const tmpId = "g_" + randomId(12);
      await set(ref(db, `chats/${tmpId}`), {
        type: "group", name: cm.name, communityId: cid,
        members: { [state.user.uid]: true },
        admins: { [state.user.uid]: true },
        owner: state.user.uid, createdAt: Date.now(),
      });
      const code = await createInvite(tmpId);
      const link = `${location.origin}${location.pathname}?invite=${code}`;
      await navigator.clipboard.writeText(link).catch(()=>{});
      alert("Convite da comunidade copiado:\n" + link);
    }
  });

  const subsBox = bg.querySelector("#subs");
  if (subsBox) {
    if (!subs.length) subsBox.innerHTML = "<p class='dim'>Nenhum ainda.</p>";
    subs.forEach(([sid, s]) => {
      const d = document.createElement("div");
      d.className = "item";
      d.innerHTML = `<img class="avatar" src="${s.avatar || avatarFallback(s.name)}"><div class="info"><strong>${s.name}</strong><small>${s.type === "channel" ? "Canal" : "Grupo"}</small></div>`;
      d.onclick = () => { document.querySelector(".modal-bg")?.remove(); openChat(sid); };
      subsBox.appendChild(d);
    });
  }
}

/* ============ CHAVE POR CHAT ============ */
async function keyForChat(cid) {
  const chat = state.chats[cid];
  if (!chat) return null;
  if (chat.type === "direct") {
    const otherUid = Object.keys(chat.members).find(u => u !== state.user.uid);
    if (state.sharedKeys.has(otherUid)) return state.sharedKeys.get(otherUid);
    const pSnap = await get(ref(db, `users/${otherUid}/publicJwk`));
    if (!pSnap.exists()) return null;
    const theirPub = await importPublic(JSON.parse(pSnap.val()));
    const key = await deriveSharedKey(state.privateKey, theirPub);
    state.sharedKeys.set(otherUid, key);
    return key;
  }
  return deriveGroupKey(cid);
}

/* ============ MENSAGENS ============ */
async function renderMessages(cid) {
  const box = $("#messages");
  box.innerHTML = "";
  if (unsubMessages) unsubMessages();

  const key = await keyForChat(cid);
  const q = query(ref(db, `messages/${cid}`), limitToLast(200));
  unsubMessages = onChildAdded(q, async (snap) => {
    const m = snap.val();
    if (!m || LS.get("hiddenMessages", {})[snap.key]) return;
    await renderOneMessage(box, { id: snap.key, ...m }, key, cid);
  });
}

async function renderOneMessage(box, m, key, cid) {
  const el = document.createElement("div");
  const mine = m.senderId === state.user.uid;
  el.className = "msg " + (mine ? "out" : "in") + (m.deleted ? " deleted" : "");
  el.dataset.messageId = m.id || "";
  const senderSnap = await get(ref(db, `users/${m.senderId}/nickname`));
  const senderName = senderSnap.exists() ? senderSnap.val() : "???";
  const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = mine ? "" : senderName; el.appendChild(meta);
  if (m.replyPreview) { const q = document.createElement("div"); q.className = "msg-reply"; q.textContent = "↪ " + m.replyPreview; el.appendChild(q); }
  const body = document.createElement("span"); body.className = "body";
  if (m.deleted) body.textContent = "Mensagem apagada";
  else if (m.type === "text") body.textContent = await decrypt({ iv: m.iv, data: m.encrypted }, key);
  else {
    const dataUrl = await decrypt({ iv: m.iv, data: m.encrypted }, key);
    if (m.type === "image") { const img = document.createElement("img"); img.className = "image-preview"; img.src = dataUrl; img.alt = m.fileName || "Imagem enviada"; img.onclick = () => openLightbox(dataUrl); body.appendChild(img); }
    else if (m.type === "audio") { const au = document.createElement("audio"); au.controls = true; au.src = dataUrl; body.appendChild(au); }
    else if (m.type === "video") { const v = document.createElement("video"); v.controls = true; v.src = dataUrl; body.appendChild(v); }
    else { const a = document.createElement("a"); a.className = "file-link"; a.href = dataUrl; a.download = m.fileName || "arquivo"; a.innerHTML = `<svg><use href="#i-download"/></svg><span>Baixar ${m.fileName || "arquivo"}</span>`; body.appendChild(a); }
  }
  el.appendChild(body);
  if (m.reactions) { const r = document.createElement("div"); r.className = "msg-reactions"; Object.entries(m.reactions).forEach(([emoji, users]) => { const b = document.createElement("button"); b.className = "msg-reaction"; b.textContent = `${emoji} ${Object.keys(users || {}).length}`; b.onclick = () => toggleReaction(cid, m, emoji); r.appendChild(b); }); el.appendChild(r); }
  const time = document.createElement("span"); time.className = "time"; time.textContent = fmtTime(m.timestamp); el.appendChild(time);
  const actions = document.createElement("div"); actions.className = "msg-actions";
  [["i-reply", "Responder"], ["i-smile-plus", "Reagir"], ["i-forward", "Encaminhar"], ["i-more", "Mais"]].forEach(([icon, label]) => { const b = document.createElement("button"); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.innerHTML = `<svg><use href="#${icon}"/></svg>`; b.onclick = () => messageAction(icon === "i-reply" ? "reply" : icon === "i-smile-plus" ? "react" : icon === "i-forward" ? "forward" : "more", m, cid); actions.appendChild(b); }); el.appendChild(actions);
  let press; el.addEventListener("pointerdown", () => { press = setTimeout(() => messageAction("more", m, cid), 550); }); ["pointerup","pointerleave","pointercancel"].forEach(ev => el.addEventListener(ev, () => clearTimeout(press)));
  box.appendChild(el); box.scrollTop = box.scrollHeight;
}
function openLightbox(src) { const b = $("#lightbox"); $("#lightbox-image").src = src; b.hidden = false; }
$("#lightbox-close").onclick = () => $("#lightbox").hidden = true;
$("#lightbox").onclick = e => { if (e.target.id === "lightbox") e.currentTarget.hidden = true; };
async function messageAction(action, m, cid) {
  const key = await keyForChat(cid);
  const preview = m.type === "text" ? await decrypt({ iv:m.iv, data:m.encrypted }, key) : (m.fileName || "mídia");
  if (action === "reply") {
    state.replyTo = { id: m.id, preview };
    $("#msg-input").placeholder = "Respondendo: " + preview;
    $("#msg-input").focus();
    return;
  }
  if (action === "react") {
    const emoji = prompt("Escolha um emoji para reagir", "❤️");
    if (emoji?.trim()) await toggleReaction(cid, m, emoji.trim());
    return;
  }
  if (action === "forward") {
    const target = prompt("Cole o ID da conversa de destino");
    if (!target || !state.chats[target]) return;
    const targetKey = await keyForChat(target);
    const plain = m.type === "text" ? preview : await decrypt({ iv:m.iv, data:m.encrypted }, key);
    const enc = await encrypt(plain, targetKey);
    await push(ref(db, `messages/${target}`), {
      senderId: state.user.uid, type: m.type, encrypted: enc.data, iv: enc.iv,
      fileName: m.fileName || "", forwarded: true, timestamp: Date.now()
    });
    return;
  }
  if (action === "more") {
    const choice = prompt("Digite uma opção: excluir para mim | excluir para todos | cancelar", "cancelar");
    if (choice === "excluir para mim") return deleteMessage(cid, m, false);
    if (choice === "excluir para todos" && m.senderId === state.user.uid) return deleteMessage(cid, m, true);
  }
}
async function toggleReaction(cid, m, emoji) {
  const path = `messages/${cid}/${m.id}/reactions/${emoji}/${state.user.uid}`;
  const snap = await get(ref(db, path));
  await set(ref(db, path), snap.exists() ? null : true);
  renderMessages(cid);
}
async function deleteMessage(cid, m, everyone) {
  if (everyone) await update(ref(db, `messages/${cid}/${m.id}`), { deleted: true, encrypted: "", iv: "" });
  else LS.set("hiddenMessages", { ...LS.get("hiddenMessages", {}), [m.id]: true });
  renderMessages(cid);
}

function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ============ COMPOSER ============ */
function wireComposer() {
  $("#btn-send").onclick = sendText;
  $("#msg-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  $("#btn-mic").onclick = recordVoice;
}

async function sendText() {
  const input = $("#msg-input");
  const text = input.value.trim();
  if (!text || !state.activeChat) return;
  input.value = "";
  const cid = state.activeChat;
  const key = await keyForChat(cid);
  const enc = await encrypt(text, key);
  const message = {
    senderId: state.user.uid, type: "text", encrypted: enc.data, iv: enc.iv, timestamp: Date.now(),
    ...(state.replyTo ? { replyTo: state.replyTo.id, replyPreview: state.replyTo.preview } : {})
  };
  state.replyTo = null;
  await push(ref(db, `messages/${cid}`), message);
}

async function sendMedia(cid, type, dataUrl, extra = {}) {
  const key = await keyForChat(cid);
  const enc = await encrypt(dataUrl, key);
  const mediaMessage = { senderId: state.user.uid, type, encrypted: enc.data, iv: enc.iv, timestamp: Date.now(), ...extra, ...(state.replyTo ? { replyTo: state.replyTo.id, replyPreview: state.replyTo.preview } : {}) };
  state.replyTo = null;
  await push(ref(db, `messages/${cid}`), mediaMessage);
}

async function recordVoice() {
  if (!state.activeChat) return;
  const btn = $("#btn-mic");
  if (btn.classList.contains("recording")) return;
  btn.classList.add("recording");
  try {
    const rec = await startVoiceRecording();
    const stop = async () => {
      btn.classList.remove("recording");
      const { dataUrl } = await rec.stop();
      await sendMedia(state.activeChat, "audio", dataUrl);
      btn.onclick = recordVoice;
    };
    btn.onclick = stop;
  } catch (e) {
    alert("Erro ao gravar: " + e.message);
    btn.classList.remove("recording");
  }
}

/* ============ ATTACH ============ */
function wireAttach() {
  $("#btn-attach").onclick = () => $("#attach-input").click();
  $("#attach-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !state.activeChat) return;
    if (file.size > 900 * 1024) return alert("Arquivo muito grande. Máx 900 KB.");
    const dataUrl = await fileToDataUrl(file, 1000, 0.75);
    let type = "file";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("audio/")) type = "audio";
    else if (file.type.startsWith("video/")) type = "video";
    await sendMedia(state.activeChat, type, dataUrl, { fileName: file.name });
  });
}

/* ============ EMOJI ============ */
const EMOJIS = "😀😃😄😁😆😅😂🤣🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤗🤔🤨😐😑😶🙄😏😣😥😮🤐😯😪😫🥱😴😌🤤😒😓😔😕🙃🤑😲🙁😖😞😟😤😢😭😦😧😨😩🤯😬😰😱🥵🥶😳🤪😵🥴😠😡🤬😷🤒🤕🤢🤮🤧🥳🥺🤠🤡🤥🤫🤭🧐🤓😎🥸👍👎👏🙏💪🤝❤️🧡💛💚💙💜🖤🤍🔥⭐✨🎉🎁🎂☕🍕🍔🍟🍎🍺🥂".split("");
function wireEmoji() {
  const picker = $("#emoji-picker");
  picker.innerHTML = EMOJIS.map(e => `<span>${e}</span>`).join("");
  $("#btn-emoji").onclick = (e) => { e.stopPropagation(); picker.hidden = !picker.hidden; };
  picker.onclick = (e) => {
    if (e.target.tagName === "SPAN") {
      $("#msg-input").value += e.target.textContent;
      $("#msg-input").focus();
    }
  };
  document.addEventListener("click", (e) => {
    if (!picker.hidden && !picker.contains(e.target) && e.target.id !== "btn-emoji") picker.hidden = true;
  });
}

/* ============ MODAL ============ */
function modal({ title, bodyHtml, onOk, okText = "Salvar", cancelText = "Cancelar", hideCancel = false }) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <div class="modal-body">${bodyHtml}</div>
      <div class="row">
        ${hideCancel ? "" : `<button class="cancel">${cancelText}</button>`}
        <button class="ok">${okText}</button>
      </div>
    </div>`;
  $("#modal-root").appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector(".cancel")?.addEventListener("click", close);
  bg.querySelector(".ok").addEventListener("click", async () => {
    const ok = await onOk(bg);
    if (ok !== false) close();
  });
  return bg;
}
function field(label, id, type = "text", value = "") {
  return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${String(value).replace(/"/g,"&quot;")}"></label>`;
}

/* ============ NEW MENU ============ */
function wireNewMenu() {
  $("#btn-new").onclick = () => {
    modal({
      title: "Criar novo", hideCancel: true, okText: "Fechar",
      bodyHtml: `
        <button class="primary" data-act="contact">Adicionar contato</button>
        <button class="primary" data-act="group">Criar grupo</button>
        <button class="primary" data-act="channel">Criar canal</button>
        <button class="primary" data-act="community">Criar comunidade</button>
        <button class="primary" data-act="invite">Entrar por convite</button>
      `,
      onOk: () => true,
    }).querySelector(".modal-body").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      document.querySelector(".modal-bg")?.remove();
      if (act === "contact")   newContactModal();
      if (act === "group")     newGroupModal();
      if (act === "channel")   newChannelModal();
      if (act === "community") newCommunityModal();
      if (act === "invite")    inviteModal();
    });
  };
}

function newContactModal() {
  modal({
    title: "Adicionar contato",
    bodyHtml: field("GHOST-ID", "c-ghostid", "text", "GHOST-") + field("Apelido (opcional)", "c-alias"),
    onOk: async (bg) => {
      try {
        await addContactByGhostId(
          bg.querySelector("#c-ghostid").value.trim().toUpperCase(),
          bg.querySelector("#c-alias").value.trim()
        );
      } catch (e) { alert(e.message); return false; }
    }
  });
}

function newGroupModal() {
  const list = Object.entries(state.contacts).map(([uid, { alias, profile }]) =>
    `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" value="${uid}"> ${alias || profile.nickname || profile.username}</label>`
  ).join("") || "<p class='dim'>Sem contatos.</p>";
  modal({
    title: "Criar grupo",
    bodyHtml: field("Nome", "g-name") + field("Avatar (URL)", "g-avatar") + `<label class="field"><span>Ou envie uma foto</span><input id="g-avatar-file" type="file" accept="image/*"></label><div class="field"><span>Membros</span>${list}</div>`,
    onOk: async (bg) => {
      const name = bg.querySelector("#g-name").value.trim();
      if (!name) return false;
      await createGroup(name,
        [...bg.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value),
        bg.querySelector("#g-avatar-file").files[0] ? await fileToDataUrl(bg.querySelector("#g-avatar-file").files[0], 500, .8) : bg.querySelector("#g-avatar").value.trim());
    }
  });
}

function newChannelModal() {
  modal({
    title: "Criar canal",
    bodyHtml: field("Nome", "ch-name") + field("Descrição", "ch-desc"),
    onOk: async (bg) => {
      const name = bg.querySelector("#ch-name").value.trim();
      if (!name) return false;
      await createChannel(name, bg.querySelector("#ch-desc").value.trim());
    }
  });
}

function newCommunityModal() {
  modal({
    title: "Criar comunidade",
    bodyHtml: field("Nome", "cm-name") + field("Descrição", "cm-desc") + field("Avatar (URL)", "cm-avatar"),
    onOk: async (bg) => {
      const name = bg.querySelector("#cm-name").value.trim();
      if (!name) return false;
      await createCommunity(name,
        bg.querySelector("#cm-desc").value.trim(),
        bg.querySelector("#cm-avatar").value.trim());
    }
  });
}

function newSubgroupModal(cid) {
  modal({
    title: "Novo subgrupo/canal",
    bodyHtml: field("Nome", "s-name") +
      `<label class="field"><span>Tipo</span><select id="s-type"><option value="group">Grupo</option><option value="channel">Canal</option></select></label>`,
    onOk: async (bg) => {
      const name = bg.querySelector("#s-name").value.trim();
      if (!name) return false;
      await createSubgroup(cid, name, bg.querySelector("#s-type").value);
    }
  });
}

function inviteModal() {
  modal({
    title: "Entrar por convite",
    bodyHtml: field("Código", "i-code"),
    onOk: async (bg) => {
      try { await joinByInviteCode(bg.querySelector("#i-code").value.trim().toUpperCase()); }
      catch (e) { alert(e.message); return false; }
    }
  });
}

/* ============ HEADER CONV ============ */
function wireConvHeader() {
  $("#btn-conv-menu").onclick = openConvMenu;
  $("#btn-call-audio").onclick = () => triggerCall(false);
  $("#btn-call-video").onclick = () => triggerCall(true);
}

async function triggerCall(video) {
  const cid = state.activeChat;
  const chat = state.chats[cid];
  if (!chat) return;
  const otherUid = Object.keys(chat.members || {}).find(u => u !== state.user.uid);
  if (!otherUid) return alert("Não há outros participantes neste chat.");
  if (chat.type !== "direct") alert("Chamada de grupo iniciada. Os participantes podem entrar pelo convite da chamada.");
  try {
    await startCall(otherUid, video);
    showCallUI(otherUid, video);
  } catch (e) {
    alert("Erro ao iniciar: " + e.message);
  }
}

async function openConvMenu() {
  const cid = state.activeChat;
  const chat = state.chats[cid];
  if (!chat) return;
  const isAdmin = chat.admins && chat.admins[state.user.uid];
  let html = "";
  if (chat.type === "group" || chat.type === "channel") {
    html += `<button class="primary" data-act="invite">Gerar convite</button>`;
    if (isAdmin) html += `<button class="primary" data-act="addmem">Adicionar membros</button>`;
    if (isAdmin && chat.type === "group") html += `<button class="primary" data-act="members">Gerenciar membros</button>`;
    html += `<button class="primary" data-act="leave">Sair</button>`;
  }
  html += `<button class="primary" data-act="close">Fechar</button>`;

  const bg = modal({ title: chat.name || "Opções", bodyHtml: html, hideCancel: true, okText: "OK", onOk: () => true });
  bg.querySelector(".modal-body").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "close") { bg.remove(); return; }
    if (act === "invite") {
      const code = await createInvite(cid);
      bg.remove();
      const link = `${location.origin}${location.pathname}?invite=${code}`;
      await navigator.clipboard.writeText(link).catch(()=>{});
      alert("Copiado:\n" + link);
    }
    if (act === "leave") { await leaveChat(cid, state.user.uid); bg.remove(); }
    if (act === "addmem") { bg.remove(); addMembersModal(cid, chat); }
    if (act === "members") { bg.remove(); manageMembersModal(cid, chat); }
  });
}

function addMembersModal(cid, chat) {
  const list = Object.entries(state.contacts)
    .filter(([uid]) => !chat.members[uid] && !(chat.banned && chat.banned[uid]))
    .map(([uid, { alias, profile }]) =>
      `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" value="${uid}"> ${alias || profile.nickname || profile.username}</label>`
    ).join("") || "<p class='dim'>Todos já estão.</p>";
  modal({
    title: "Adicionar membros",
    bodyHtml: `<div class="field"><span>Contatos</span>${list}</div>`,
    onOk: async (bg) => {
      const uids = [...bg.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
      for (const u of uids) await addMemberToChat(cid, u);
    }
  });
}

function manageMembersModal(cid, chat) {
  const isAdmin = chat.admins && chat.admins[state.user.uid];
  const rows = Object.keys(chat.members).map(uid => {
    const c = state.contacts[uid];
    const name = c ? (c.alias || c.profile.nickname || c.profile.username) : uid.slice(0, 6);
    const role = chat.admins?.[uid] ? "admin" : "membro";
    return `<div class="item" style="border-radius:8px;margin-bottom:4px">
      <div class="info"><strong>${name}</strong><small>${role}</small></div>
      ${isAdmin && uid !== chat.owner ? `
        <button class="icon" data-ban="${uid}" title="Banir"><svg><use href="#i-back"/></svg></button>
        <button class="icon" data-prom="${uid}" title="Promover"><svg><use href="#i-plus"/></svg></button>
      ` : ""}
    </div>`;
  }).join("");

  const bg = modal({ title: "Membros", bodyHtml: rows || "<p class='dim'>Vazio.</p>", hideCancel: true, okText: "Fechar", onOk: () => true });
  bg.querySelector(".modal-body").addEventListener("click", async (e) => {
    const ban = e.target.closest("[data-ban]");
    const prom = e.target.closest("[data-prom]");
    if (ban) { if (confirm("Banir este membro?")) { await banMember(cid, ban.dataset.ban); bg.remove(); } }
    if (prom) { await promoteToAdmin(cid, prom.dataset.prom); bg.remove(); }
  });
}

/* ============ SETTINGS ============ */
function wireSettings() { $("#btn-settings").onclick = openSettings; }

function openSettings() {
  modal({
    title: "Configurações", hideCancel: true, okText: "Fechar", onOk: () => true,
    bodyHtml: `
      <button class="primary" data-act="profile">Editar perfil</button>
      <button class="primary" data-act="wall">Papel de parede</button>
      <button class="primary" data-act="copy">Copiar meu GHOST-ID</button>
      <button class="primary" data-act="logout">Sair</button>
    `
  }).querySelector(".modal-body").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    document.querySelector(".modal-bg")?.remove();
    if (act === "profile") editProfileModal();
    if (act === "wall")    wallpaperModal();
    if (act === "copy")    { await navigator.clipboard.writeText(state.profile.ghostId); alert("Copiado: " + state.profile.ghostId); }
    if (act === "logout")  { await signOut(auth); location.reload(); }
  });
}

function editProfileModal() {
  const p = state.profile;
  modal({
    title: "Editar perfil",
    bodyHtml:
      field("Apelido", "p-nick", "text", p.nickname || "") +
      `<label class="field"><span>Bio</span><textarea id="p-bio" maxlength="160">${p.bio || ""}</textarea></label>` +
      field("Avatar (URL)", "p-avatar", "text", p.avatar || "") +
      `<label class="field"><span>Ou upload avatar</span><input id="p-avatar-file" type="file" accept="image/*"></label>` +
      field("Banner (URL)", "p-banner", "text", p.banner || "") +
      `<label class="field"><span>Ou upload banner</span><input id="p-banner-file" type="file" accept="image/*"></label>`,
    onOk: async (bg) => {
      let avatar = bg.querySelector("#p-avatar").value.trim();
      let banner = bg.querySelector("#p-banner").value.trim();
      const av = bg.querySelector("#p-avatar-file").files[0];
      const bn = bg.querySelector("#p-banner-file").files[0];
      if (av) avatar = await fileToDataUrl(av, 400, 0.8);
      if (bn) banner = await fileToDataUrl(bn, 1000, 0.75);
      await update(ref(db, `users/${state.user.uid}`), {
        nickname: bg.querySelector("#p-nick").value.trim(),
        bio:      bg.querySelector("#p-bio").value.trim(),
        avatar, banner,
      });
    }
  });
}

function wallpaperModal() {
  const bg = modal({
    title: "Papel de parede",
    bodyHtml: field("URL", "w-url", "text", state.settings.wallpaper || "") +
              `<label class="field"><span>Ou upload</span><input id="w-file" type="file" accept="image/*"></label>` +
              `<button class="primary" id="w-clear">Remover</button>`,
    onOk: async (b) => {
      let url = b.querySelector("#w-url").value.trim();
      const f = b.querySelector("#w-file").files[0];
      if (f) url = await fileToDataUrl(f, 1600, 0.75);
      state.settings.wallpaper = url;
      LS.set("settings", state.settings);
      document.documentElement.style.setProperty("--wall", url ? `url(${url})` : "none");
    }
  });
  bg.querySelector("#w-clear").onclick = () => {
    state.settings.wallpaper = "";
    LS.set("settings", state.settings);
    document.documentElement.style.setProperty("--wall", "none");
    bg.remove();
  };
}

/* ============ CALLS UI ============ */
function wireCalls() {
  CallEvents.addEventListener("remoteStream", (e) => {
    const rv = $("#remote-video");
    if (rv.srcObject !== e.detail) rv.srcObject = e.detail;
  });
  CallEvents.addEventListener("status", (e) => {
    const s = e.detail;
    const el = $("#call-status");
    if (el) el.textContent = s === "active" ? "Em chamada" : s === "ringing" ? "Chamando…" : s;
  });
  CallEvents.addEventListener("state", (e) => {
    const el = $("#call-status");
    if (el) el.textContent = e.detail;
  });
  CallEvents.addEventListener("ended", () => {
    $("#call-overlay").hidden = true;
    $("#remote-video").srcObject = null;
    $("#local-video").srcObject = null;
  });

  $("#call-end").onclick = () => endCall();
  $("#call-mic").onclick = (e) => {
    const b = e.currentTarget;
    const on = b.dataset.on !== "1";
    b.dataset.on = on ? "1" : "0";
    b.classList.toggle("muted", !on);
    toggleMic(on);
  };
  $("#call-cam").onclick = (e) => {
    const b = e.currentTarget;
    const on = b.dataset.on !== "1";
    b.dataset.on = on ? "1" : "0";
    b.classList.toggle("off-state", !on);
    toggleCam(on);
  };

  $("#incoming-accept").onclick = async () => {
    const c = state.incomingCall;
    if (!c) return;
    $("#incoming-toast").hidden = true;
    try {
      await acceptCall(c.id, c.video);
      showCallUI(c.from, c.video);
    } catch (e) { alert("Erro: " + e.message); }
  };
  $("#incoming-reject").onclick = async () => {
    const c = state.incomingCall;
    if (!c) return;
    $("#incoming-toast").hidden = true;
    await rejectCall(c.id);
  };
}

function showCallUI(peerUid, video) {
  const contact = state.contacts[peerUid];
  const name = contact ? (contact.alias || contact.profile.nickname || contact.profile.username) : "Usuário";
  $("#call-peer").textContent = name;
  $("#call-status").textContent = "Chamando…";
  $("#call-overlay").hidden = false;

  const lv = $("#local-video");
  lv.srcObject = state.activeCall?.localStream;
  lv.hidden = !video;
  $("#call-cam").hidden = !video;
  $("#call-cam").dataset.on = "1";
  $("#call-cam").classList.remove("off-state");
  $("#call-mic").dataset.on = "1";
  $("#call-mic").classList.remove("muted");
}

function showIncomingToast(call) {
  $("#incoming-from").textContent = call.fromNick || "Alguém";
  $("#incoming-type").textContent = call.video ? "Chamada de vídeo" : "Chamada de áudio";
  $("#incoming-toast").hidden = false;

  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  try {
    const ctx = new (AudioContext || webkitAudioContext)();
    const beep = () => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 800; g.gain.value = 0.1;
      o.start(); setTimeout(() => o.stop(), 200);
    };
    beep(); state._ringTimer = setInterval(beep, 1500);
  } catch {}

  const stop = () => { clearInterval(state._ringTimer); };
  $("#incoming-accept").addEventListener("click", stop, { once: true });
  $("#incoming-reject").addEventListener("click", stop, { once: true });
}

/* ============ INVITE URL ============ */
(async () => {
  const params = new URLSearchParams(location.search);
  const code = params.get("invite");
  if (!code) return;
  const wait = setInterval(async () => {
    if (!state.user) return;
    clearInterval(wait);
    try { await joinByInviteCode(code.toUpperCase()); alert("Você entrou!"); }
    catch (e) { alert("Convite inválido: " + e.message); }
    history.replaceState(null, "", location.pathname);
  }, 500);
})();