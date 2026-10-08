import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

export const state = {
  user: null,
  profile: null,
  privateKey: null,
  publicJwk: null,
  contacts: {},
  chats: {},
  communities: {},
  activeChat: null,
  activeCommunity: null,
  sharedKeys: new Map(),
  settings: { wallpaper: "", theme: "dark" },
  incomingCall: null,
  activeCall: null,
  currentTab: "chats",
};

const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
};
export { LS };
