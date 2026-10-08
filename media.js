// Conversões base64, compressão de imagem, gravação de áudio

export function fileToDataUrl(file, maxSize = 900, quality = 0.75) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      if (!file.type.startsWith("image/")) return res(r.result); // áudio/arquivo cru
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxSize / Math.max(w, h));
        canvas.width = w * scale; canvas.height = h * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej;
      img.src = r.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function dataUrlBytes(dataUrl) {
  // estimativa do tamanho em bytes
  const i = dataUrl.indexOf(",");
  const b64 = dataUrl.slice(i + 1);
  return Math.floor(b64.length * 0.75);
}

// ---- Gravação de áudio (voz) ----
let mediaRecorder = null;
let chunks = [];
let startedAt = 0;

export async function startVoiceRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  startedAt = Date.now();
  mediaRecorder = new MediaRecorder(stream, { mimeType: pickMime() });
  mediaRecorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  mediaRecorder.start();
  return {
    stop: () => new Promise((res) => {
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const dataUrl = await blobToDataUrl(blob);
        res({ dataUrl, duration: Math.round((Date.now() - startedAt) / 1000), mime: blob.type });
      };
      mediaRecorder.stop();
    }),
  };
}

function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of opts) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
