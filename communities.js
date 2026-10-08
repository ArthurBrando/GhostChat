import {
  ref, push, set, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db, state } from "./store.js";
import { randomId } from "./crypto.js";

export async function createCommunity(name, desc = "", avatar = "") {
  const cid = "cm_" + randomId(12);
  await set(ref(db, `communities/${cid}`), {
    name, desc, avatar,
    owner: state.user.uid,
    admins: { [state.user.uid]: true },
    members: { [state.user.uid]: true },
    createdAt: Date.now(),
  });
  return cid;
}

export async function joinCommunity(cid) {
  const s = await get(ref(db, `communities/${cid}`));
  if (!s.exists()) throw new Error("Comunidade não encontrada.");
  const cm = s.val();
  if (cm.banned && cm.banned[state.user.uid]) throw new Error("Você foi banido desta comunidade.");
  await update(ref(db, `communities/${cid}/members`), { [state.user.uid]: true });
}

export async function createSubgroup(communityId, name, type = "group", avatar = "") {
  const chatId = (type === "channel" ? "c_" : "g_") + randomId(12);
  await set(ref(db, `chats/${chatId}`), {
    type, name, avatar,
    communityId,
    members: { [state.user.uid]: true },
    admins: { [state.user.uid]: true },
    owner: state.user.uid,
    createdAt: Date.now(),
  });
  return chatId;
}

export async function addMemberToChat(chatId, uid) {
  await update(ref(db, `chats/${chatId}/members`), { [uid]: true });
}

export async function banMember(chatId, uid) {
  const updates = {};
  updates[`chats/${chatId}/members/${uid}`] = null;
  updates[`chats/${chatId}/banned/${uid}`] = true;
  await update(ref(db), updates);
}

export async function unbanMember(chatId, uid) {
  await update(ref(db, `chats/${chatId}/banned`), { [uid]: null });
}

export async function promoteToAdmin(chatId, uid) {
  await update(ref(db, `chats/${chatId}/admins`), { [uid]: true });
}

export async function demoteAdmin(chatId, uid) {
  await update(ref(db, `chats/${chatId}/admins`), { [uid]: null });
}

export async function leaveChat(chatId, uid) {
  await update(ref(db, `chats/${chatId}/members`), { [uid]: null });
}

export function subscribeCommunities(uid, cb) {
  return onValue(ref(db, "communities"), snap => {
    const all = snap.val() || {};
    const mine = {};
    for (const [cid, c] of Object.entries(all)) if (c.members?.[uid]) mine[cid] = c;
    state.communities = mine;
    cb(mine);
  });
}
