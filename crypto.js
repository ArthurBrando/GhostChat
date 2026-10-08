// E2EE real: ECDH P-256 + AES-GCM 256
const subtle = crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export async function generateKeyPair() {
  const kp = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const publicJwk  = await subtle.exportKey("jwk", kp.publicKey);
  const privateJwk = await subtle.exportKey("jwk", kp.privateKey);
  return { publicJwk, privateJwk };
}

export async function importPrivate(jwk) {
  return subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
}

export async function importPublic(jwk) {
  return subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

export async function deriveSharedKey(myPrivate, theirPublic) {
  return subtle.deriveKey(
    { name: "ECDH", public: theirPublic },
    myPrivate,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function deriveGroupKey(chatId) {
  const base = await subtle.importKey("raw", te.encode(chatId), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: te.encode("ghost-group-v1"), iterations: 100000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(text));
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(buf))),
  };
}

export async function decrypt({ iv, data }, key) {
  try {
    const ivArr  = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    const dataArr = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: ivArr }, key, dataArr);
    return td.decode(plain);
  } catch {
    return "🔒 [não foi possível decifrar]";
  }
}

export function randomId(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = crypto.getRandomValues(new Uint8Array(len));
  for (const b of arr) out += chars[b % chars.length];
  return out;
}

export function generateGhostId() {
  return `GHOST-${randomId(4)}-${randomId(4)}`;
}
