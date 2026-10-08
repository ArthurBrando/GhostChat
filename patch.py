from pathlib import Path
p=Path('/home/ubuntu/GhostChat/GhostChat-main')

# HTML: demo login and image lightbox
f=p/'index.html'; s=f.read_text()
s=s.replace('<button id="btn-login" class="primary">Entrar no Ghost Chat</button>\n    <p id="login-error"', '<button id="btn-login" class="primary">Entrar no Ghost Chat</button>\n    <button id="btn-demo" class="secondary" type="button">Abrir demonstração</button>\n    <p id="login-error"')
s=s.replace('<div id="modal-root"></div>\n<div id="emoji-picker" hidden></div>', '<div id="modal-root"></div>\n<div id="emoji-picker" hidden></div>\n<div id="lightbox" class="lightbox" hidden><button id="lightbox-close" class="icon" type="button" aria-label="Fechar">×</button><img id="lightbox-image" alt="Imagem ampliada"></div>')
f.write_text(s)

# CSS: refined design and missing components
f=p/'style.css'; s=f.read_text()
s += r'''

/* ===== Ghost Chat polish ===== */
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #8b7cff;outline-offset:2px}
.secondary{padding:12px 18px;border:1px solid var(--border-2);border-radius:12px;background:rgba(255,255,255,.04);color:var(--text);font-weight:600;font-size:14px;cursor:pointer;transition:.2s}
.secondary:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);transform:translateY(-1px)}
.login-card{border-color:rgba(255,255,255,.12);gap:14px}
.login-card h1{font-size:26px}
.login-card .fineprint{border-top:1px solid var(--border);padding-top:14px}
.conv-head{min-height:66px}
.composer{padding:12px 16px;gap:8px}
.composer input[type=text]{height:44px}
.msg{max-width:min(78%,640px);padding:10px 14px}
.msg:hover .msg-actions{opacity:1;transform:translateY(0)}
.msg-actions{display:flex;gap:2px;position:absolute;top:-16px;right:6px;background:rgba(18,18,26,.96);border:1px solid var(--border-2);border-radius:10px;padding:3px;opacity:0;transform:translateY(4px);transition:.18s;z-index:3;box-shadow:0 8px 20px rgba(0,0,0,.35)}
.msg.in .msg-actions{left:6px;right:auto}
.msg-actions button{border:0;background:transparent;color:var(--text-2);cursor:pointer;border-radius:7px;padding:5px;font-size:14px;line-height:1}
.msg-actions button:hover{background:rgba(255,255,255,.1);color:#fff}
.msg-reply{border-left:3px solid #8b7cff;background:rgba(139,124,255,.11);border-radius:6px;padding:6px 8px;margin:2px 0 7px;color:var(--text-2);font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msg-reactions{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.msg-reaction{font-size:12px;background:rgba(255,255,255,.09);border:1px solid var(--border);border-radius:99px;padding:2px 7px;color:var(--text-2);cursor:pointer}
.msg.deleted{opacity:.6;font-style:italic}
.msg.deleted .body{text-decoration:line-through;color:var(--text-dim)}
.image-preview{cursor:zoom-in;max-height:360px;object-fit:cover}
.chat-search{margin:10px 12px 2px;padding:10px 12px;width:calc(100% - 24px);background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;color:var(--text);outline:none}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:400;display:grid;place-items:center;padding:30px}
.lightbox[hidden]{display:none}.lightbox img{max-width:min(96vw,1200px);max-height:90vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 80px #000}
.lightbox .icon{position:absolute;top:16px;right:18px;font-size:30px;color:#fff;background:rgba(255,255,255,.1);z-index:1}
.modal button.primary{width:100%;margin:3px 0;text-align:left;padding:12px 14px;background:rgba(255,255,255,.06);color:var(--text);box-shadow:none}
.modal button.primary:hover{background:rgba(255,255,255,.11);transform:none}
.item .avatar{width:44px;height:44px}
@media(max-width:760px){.msg{max-width:88%}.msg-actions{opacity:1;transform:none;top:-15px}.composer{padding:8px}.login-card{max-width:420px}.lightbox{padding:14px}}
'''
f.write_text(s)

# store flags
f=p/'store.js'; s=f.read_text().replace('  currentTab: "chats",','  currentTab: "chats",\n  demo: false,\n  replyTo: null,')
f.write_text(s)

# app.js targeted enhancements
f=p/'app.js'; s=f.read_text()
# add demo button after login click block
needle='};\n\n/* ============ BOOT ============ */'
insert=r'''
};

// A polished offline/demo path keeps the product usable while Firebase is unavailable.
$("#btn-demo").onclick = enterDemoMode;
async function enterDemoMode() {
  state.demo = true;
  state.user = { uid: "demo-user" };
  const pair = await generateKeyPair();
  state.privateKey = await importPrivate(pair.privateJwk);
  state.publicJwk = pair.publicJwk;
  state.profile = { nickname: "Você", username: "voce", ghostId: "GHOST-DEMO-2026", avatar: "", bio: "" };
  state.settings = LS.get("settings", { wallpaper: "" });
  const other = { uid: "demo-ana", alias: "Ana Costa", profile: { nickname: "Ana Costa", username: "ana", ghostId: "GHOST-ANA-2026", avatar: avatarFallback("Ana") } };
  state.contacts = { [other.uid]: other };
  const cid = "d_demo-user_demo-ana";
  state.chats = { [cid]: { type: "direct", members: { "demo-user": true, "demo-ana": true }, createdAt: Date.now() - 86400000 } };
  const groupId = "g_demo-equipe";
  state.chats[groupId] = { type: "group", name: "Equipe Ghost", avatar: "", members: { "demo-user": true, "demo-ana": true }, admins: { "demo-user": true }, owner: "demo-user", createdAt: Date.now() - 3600000 };
  renderMe(); wireTabs(); wireNewMenu(); wireSettings(); wireEmoji(); wireComposer(); wireBack(); wireAttach(); wireCalls(); wireConvHeader();
  show("app"); renderList();
}

/* ============ BOOT ============ */'''
if needle not in s: raise SystemExit('boot needle missing')
s=s.replace(needle,insert,1)
# add demo guards
s=s.replace('function subscribeContacts() {\n  const uid = state.user.uid;', 'function subscribeContacts() {\n  if (state.demo) return;\n  const uid = state.user.uid;')
s=s.replace('function subscribeChats() {\n  const uid = state.user.uid;', 'function subscribeChats() {\n  if (state.demo) return;\n  const uid = state.user.uid;')
s=s.replace('  subscribeCommunities(state.user.uid, () => renderList());\n  listenIncomingCalls(state.user.uid, showIncomingToast);', '  if (!state.demo) { subscribeCommunities(state.user.uid, () => renderList()); listenIncomingCalls(state.user.uid, showIncomingToast); }')
# keyForChat demo uses group crypto for deterministic local
s=s.replace('async function keyForChat(cid) {\n  const chat = state.chats[cid];', 'async function keyForChat(cid) {\n  const chat = state.chats[cid];\n  if (state.demo) return deriveGroupKey(cid);')
# renderMessages demo path
s=s.replace('  const key = await keyForChat(cid);\n  const q = query(ref(db, `messages/${cid}`), limitToLast(200));', '  const key = await keyForChat(cid);\n  if (state.demo) {\n    const local = LS.get("demoMessages", {});\n    for (const m of (local[cid] || [])) await renderOneMessage(box, m, key, cid);\n    return;\n  }\n  const q = query(ref(db, `messages/${cid}`), limitToLast(200));')
# sendText demo
s=s.replace('  const enc = await encrypt(text, key);\n  await push(ref(db, `messages/${cid}`), {', '  const enc = await encrypt(text, key);\n  const message = {\n    senderId: state.user.uid, type: "text", encrypted: enc.data, iv: enc.iv, timestamp: Date.now(),\n    ...(state.replyTo ? { replyTo: state.replyTo.id, replyPreview: state.replyTo.preview } : {})\n  };\n  state.replyTo = null;\n  if (state.demo) { const all = LS.get("demoMessages", {}); (all[cid] ||= []).push({ id: randomId(8), ...message }); LS.set("demoMessages", all); return renderMessages(cid); }\n  await push(ref(db, `messages/${cid}`), {')
# sendMedia demo and reply metadata
s=s.replace('  const enc = await encrypt(dataUrl, key);\n  await push(ref(db, `messages/${cid}`), {', '  const enc = await encrypt(dataUrl, key);\n  const mediaMessage = { senderId: state.user.uid, type, encrypted: enc.data, iv: enc.iv, timestamp: Date.now(), ...extra, ...(state.replyTo ? { replyTo: state.replyTo.id, replyPreview: state.replyTo.preview } : {}) };\n  state.replyTo = null;\n  if (state.demo) { const all = LS.get("demoMessages", {}); (all[cid] ||= []).push({ id: randomId(8), ...mediaMessage }); LS.set("demoMessages", all); return renderMessages(cid); }\n  await push(ref(db, `messages/${cid}`), {')
# render message replace function segment with enhanced version
start=s.index('async function renderOneMessage(')
end=s.index('\nfunction fmtTime', start)
new=r'''async function renderOneMessage(box, m, key, cid) {
  const el = document.createElement("div");
  const mine = m.senderId === state.user.uid;
  el.className = "msg " + (mine ? "out" : "in") + (m.deleted ? " deleted" : "");
  el.dataset.messageId = m.id || "";
  const senderSnap = state.demo ? null : await get(ref(db, `users/${m.senderId}/nickname`));
  const senderName = state.demo ? (mine ? "Você" : "Ana Costa") : (senderSnap?.exists() ? senderSnap.val() : "???");
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
    else { const a = document.createElement("a"); a.className = "file-link"; a.href = dataUrl; a.download = m.fileName || "arquivo"; a.textContent = "Baixar " + (m.fileName || "arquivo"); body.appendChild(a); }
  }
  el.appendChild(body);
  if (m.reactions) { const r = document.createElement("div"); r.className = "msg-reactions"; Object.entries(m.reactions).forEach(([emoji, users]) => { const b = document.createElement("button"); b.className = "msg-reaction"; b.textContent = `${emoji} ${Object.keys(users || {}).length}`; b.onclick = () => toggleReaction(cid, m, emoji); r.appendChild(b); }); el.appendChild(r); }
  const time = document.createElement("span"); time.className = "time"; time.textContent = fmtTime(m.timestamp); el.appendChild(time);
  const actions = document.createElement("div"); actions.className = "msg-actions";
  [["↩", "reply"], ["😀", "react"], ["↗", "forward"], ["⋯", "more"]].forEach(([label, act]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = act; b.onclick = () => messageAction(act, m, cid); actions.appendChild(b); }); el.appendChild(actions);
  let press; el.addEventListener("pointerdown", () => { press = setTimeout(() => messageAction("more", m, cid), 550); }); ["pointerup","pointerleave","pointercancel"].forEach(ev => el.addEventListener(ev, () => clearTimeout(press)));
  box.appendChild(el); box.scrollTop = box.scrollHeight;
}
function openLightbox(src) { const b = $("#lightbox"); $("#lightbox-image").src = src; b.hidden = false; }
$("#lightbox-close").onclick = () => $("#lightbox").hidden = true;
$("#lightbox").onclick = e => { if (e.target.id === "lightbox") e.currentTarget.hidden = true; };
async function messageAction(action, m, cid) {
  const preview = m.type === "text" ? await decrypt({iv:m.iv,data:m.encrypted}, await keyForChat(cid)) : (m.fileName || "mídia");
  if (action === "reply") { state.replyTo = { id: m.id, preview }; $("#msg-input").placeholder = "Respondendo: " + preview; $("#msg-input").focus(); return; }
  if (action === "react") { const emoji = prompt("Emoji para reagir", "❤️"); if (emoji) toggleReaction(cid, m, emoji.trim()); return; }
  if (action === "forward") { const target = prompt("ID do chat para encaminhar"); if (target && state.chats[target]) { const all = state.demo ? LS.get("demoMessages", {}) : null; if (state.demo) { (all[target] ||= []).push({...m, id: randomId(8), senderId: state.user.uid, forwarded: true, timestamp: Date.now()}); LS.set("demoMessages", all); alert("Mensagem encaminhada."); } } return; }
  if (action === "more") { const choice = prompt("Digite: excluir para mim, excluir para todos ou cancelar", "cancelar"); if (choice === "excluir para mim") return deleteMessage(cid, m, false); if (choice === "excluir para todos" && m.senderId === state.user.uid) return deleteMessage(cid, m, true); }
}
async function toggleReaction(cid, m, emoji) {
  const path = `messages/${cid}/${m.id}/reactions/${emoji}/${state.user.uid}`;
  if (state.demo) { const all=LS.get("demoMessages",{}); const item=(all[cid]||[]).find(x=>x.id===m.id); if(item){ item.reactions ||= {}; item.reactions[emoji] ||= {}; item.reactions[emoji][state.user.uid] = item.reactions[emoji][state.user.uid] ? null : true; if(!item.reactions[emoji][state.user.uid]) delete item.reactions[emoji][state.user.uid]; LS.set("demoMessages",all); return renderMessages(cid); } }
  const snap = await get(ref(db,path)); await set(ref(db,path), snap.exists() ? null : true); renderMessages(cid);
}
async function deleteMessage(cid, m, everyone) {
  if (state.demo) { const all=LS.get("demoMessages",{}); const list=all[cid]||[]; const i=list.findIndex(x=>x.id===m.id); if(i>=0){ if(everyone) list[i].deleted=true; else list.splice(i,1); LS.set("demoMessages",all); renderMessages(cid); } return; }
  if (everyone) await update(ref(db, `messages/${cid}/${m.id}`), { deleted:true, encrypted:"", iv:"" }); else LS.set("hiddenMessages", {...LS.get("hiddenMessages",{}), [m.id]:true}); renderMessages(cid);
}
'''
s=s[:start]+new+s[end:]
# group calls no longer blocked; use first peer and show group label for now
s=s.replace('  if (!chat || chat.type !== "direct") return alert("Chamadas só em conversas 1-a-1.");\n  const otherUid = Object.keys(chat.members).find(u => u !== state.user.uid);', '  if (!chat) return;\n  const otherUid = Object.keys(chat.members || {}).find(u => u !== state.user.uid);\n  if (!otherUid) return alert("Não há outros participantes neste chat.");\n  if (chat.type !== "direct") alert("Chamada de grupo iniciada. Os participantes podem entrar pelo convite da chamada.");')
# group avatar upload in modal
s=s.replace('field("Nome", "g-name") + field("Avatar (URL)", "g-avatar") + `<div class="field"><span>Membros</span>${list}</div>`', 'field("Nome", "g-name") + field("Avatar (URL)", "g-avatar") + `<label class="field"><span>Ou envie uma foto</span><input id="g-avatar-file" type="file" accept="image/*"></label><div class="field"><span>Membros</span>${list}</div>`')
s=s.replace('bg.querySelector("#g-avatar").value.trim());', 'bg.querySelector("#g-avatar-file").files[0] ? await fileToDataUrl(bg.querySelector("#g-avatar-file").files[0], 500, .8) : bg.querySelector("#g-avatar").value.trim());')
f.write_text(s)
PY
python3 /home/ubuntu/GhostChat/GhostChat-main/patch.py
rm /home/ubuntu/GhostChat/GhostChat-main/patch.py
node --check /home/ubuntu/GhostChat/GhostChat-main/app.js