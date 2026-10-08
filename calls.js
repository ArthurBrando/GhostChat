import {
  ref, push, set, get, update, onValue, onChildAdded, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db, state } from "./store.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

let pc = null;
let localStream = null;
let currentCallId = null;
const unsubs = [];

export const CallEvents = new EventTarget();

export async function startCall(otherUid, video) {
  if (pc) throw new Error("Já existe uma chamada ativa.");
  const callId = push(ref(db, "calls")).key;

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  pc = new RTCPeerConnection(RTC_CONFIG);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) push(ref(db, `calls/${callId}/callerCandidates`), e.candidate.toJSON());
  };

  pc.ontrack = e => {
    CallEvents.dispatchEvent(new CustomEvent("remoteStream", { detail: e.streams[0] }));
  };
  pc.onconnectionstatechange = () => {
    CallEvents.dispatchEvent(new CustomEvent("state", { detail: pc.connectionState }));
    if (["failed","closed","disconnected"].includes(pc.connectionState)) endCall();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await set(ref(db, `calls/${callId}`), {
    from: state.user.uid,
    fromNick: state.profile.nickname,
    to: otherUid,
    video,
    offer: { type: offer.type, sdp: offer.sdp },
    status: "ringing",
    createdAt: Date.now(),
  });

  unsubs.push(onChildAdded(ref(db, `calls/${callId}/calleeCandidates`), snap => {
    pc?.addIceCandidate(new RTCIceCandidate(snap.val()));
  }));

  unsubs.push(onValue(ref(db, `calls/${callId}/status`), snap => {
    const s = snap.val();
    CallEvents.dispatchEvent(new CustomEvent("status", { detail: s }));
    if (s === "ended" || s === "rejected") endCall();
  }));

  currentCallId = callId;
  state.activeCall = { id: callId, role: "caller", video, otherUid, localStream };
  return callId;
}

export async function acceptCall(callId, video) {
  const snap = await get(ref(db, `calls/${callId}`));
  if (!snap.exists()) throw new Error("Chamada não encontrada.");
  const call = snap.val();

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
  pc = new RTCPeerConnection(RTC_CONFIG);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) push(ref(db, `calls/${callId}/calleeCandidates`), e.candidate.toJSON());
  };
  pc.ontrack = e => {
    CallEvents.dispatchEvent(new CustomEvent("remoteStream", { detail: e.streams[0] }));
  };
  pc.onconnectionstatechange = () => {
    CallEvents.dispatchEvent(new CustomEvent("state", { detail: pc.connectionState }));
    if (["failed","closed","disconnected"].includes(pc.connectionState)) endCall();
  };

  await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await update(ref(db, `calls/${callId}`), {
    answer: { type: answer.type, sdp: answer.sdp },
    status: "active",
  });

  unsubs.push(onChildAdded(ref(db, `calls/${callId}/callerCandidates`), snap => {
    pc?.addIceCandidate(new RTCIceCandidate(snap.val()));
  }));

  unsubs.push(onValue(ref(db, `calls/${callId}/status`), snap => {
    const s = snap.val();
    if (s === "ended") endCall();
  }));

  currentCallId = callId;
  state.activeCall = { id: callId, role: "callee", video, otherUid: call.from, localStream };
  return callId;
}

export async function rejectCall(callId) {
  await update(ref(db, `calls/${callId}`), { status: "rejected" });
  setTimeout(() => remove(ref(db, `calls/${callId}`)), 3000);
}

export async function endCall() {
  try {
    if (currentCallId) {
      await update(ref(db, `calls/${currentCallId}`), { status: "ended" }).catch(()=>{});
      setTimeout(() => remove(ref(db, `calls/${currentCallId}`)).catch(()=>{}), 2000);
    }
  } finally {
    unsubs.forEach(u => { try { u(); } catch {} });
    unsubs.length = 0;
    localStream?.getTracks().forEach(t => t.stop());
    try { pc?.close(); } catch {}
    pc = null; localStream = null; currentCallId = null;
    state.activeCall = null;
    CallEvents.dispatchEvent(new CustomEvent("ended"));
  }
}

export function toggleMic(on) {
  localStream?.getAudioTracks().forEach(t => t.enabled = on);
}
export function toggleCam(on) {
  localStream?.getVideoTracks().forEach(t => t.enabled = on);
}

export function listenIncomingCalls(uid, onIncoming) {
  const q = ref(db, "calls");
  return onValue(q, (snap) => {
    const all = snap.val() || {};
    for (const [id, c] of Object.entries(all)) {
      if (c.to === uid && c.status === "ringing" && !state.activeCall) {
        state.incomingCall = { id, ...c };
        onIncoming(state.incomingCall);
        return;
      }
    }
    state.incomingCall = null;
  });
}
