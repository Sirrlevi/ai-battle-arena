// ---------- FIGHT RECORDER MODULE ----------
//
// HONEST SCOPE NOTE (read this before touching mimeType logic below):
// There is no browser API that produces an .mkv file — Matroska isn't a
// recording target any browser's MediaRecorder implements, full stop. The
// only way to get a real .mkv (or a guaranteed-everywhere .mp4) client-side
// is transcoding with something like ffmpeg.wasm — a ~25-30MB WASM binary,
// a real new dependency, and not something addable to this project without
// npm/network access to actually install and test it. So this module does
// the honest version: it asks the browser for .mp4 first and only falls
// back to .webm where the browser itself can't produce mp4. Both are real,
// standard, widely-playable video files (VLC/Discord/YouTube/etc. all take
// .webm directly) — this is not a fake or placeholder format, just not
// literally what was asked for on every browser.
//
// WHAT THIS ACTUALLY DOES: captures the live arena SVG frame-by-frame onto
// a hidden <canvas> (serialize -> data URL -> Image -> drawImage, since
// there's no direct "record this SVG" browser API), feeds that canvas into
// canvas.captureStream(), and records the result with MediaRecorder. This
// is a well-established technique, but — flagging honestly — browser Media
// APIs have real cross-browser quirks (Safari in particular has historically
// been pickier about SVG-as-Image loading and supported mimeTypes) that are
// genuinely hard to fully verify by reading code alone. Everything else in
// this project was deterministic rendering math I could reason through with
// high confidence; this module leans on browser APIs I have no way to
// actually run here. Test this for real before relying on it.

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1", // Safari, and recent Chrome/Edge versions
  "video/mp4",
  "video/webm;codecs=vp9", // universal fallback — every modern browser's MediaRecorder supports some form of this
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickRecordingMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return null;
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // isTypeSupported itself throwing is not something any spec promises
      // won't happen — treat it the same as "not supported" and keep going.
    }
  }
  return null;
}

export function extensionForMimeType(mimeType) {
  return mimeType && mimeType.includes("mp4") ? "mp4" : "webm";
}

/**
 * Draws one frame of `svgEl` onto `canvas`. Returns a promise that resolves
 * once the draw completes (or fails) — awaited between frames in the
 * recording loop below so successive snapshots never overlap/race each
 * other, at the cost of the actual achieved frame rate depending on how
 * fast the browser can rasterize each snapshot rather than a hard guarantee.
 */
function drawSvgFrame(svgEl, canvas, ctx) {
  return new Promise((resolve) => {
    let xml;
    try {
      xml = new XMLSerializer().serializeToString(svgEl);
    } catch {
      resolve(false);
      return;
    }
    const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false); // don't let one bad frame hang the recording loop
    img.src = `data:image/svg+xml;base64,${svg64}`;
  });
}

/**
 * Creates a recorder bound to a live <svg> element. Returns null (caller
 * should show a "not supported" message) if this browser can't produce any
 * playable video format at all, or if svgEl is missing. Nothing here
 * starts recording yet — call .start().
 */
export function createFightRecorder(svgEl, { fps = 30, width, height, videoBitsPerSecond = 4_000_000 } = {}) {
  const mimeType = pickRecordingMimeType();
  if (!mimeType || !svgEl) return null;

  const viewBox = svgEl.viewBox?.baseVal;
  const canvas = document.createElement("canvas");
  canvas.width = width || viewBox?.width || 1000;
  canvas.height = height || viewBox?.height || 420;
  const ctx = canvas.getContext("2d");

  let stream, recorder;
  try {
    stream = canvas.captureStream(fps);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  } catch {
    return null; // a browser can pass isTypeSupported and still fail to actually construct — treat as unsupported rather than throwing into the caller
  }

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let running = false;
  let timeoutHandle = null;

  async function drawLoop() {
    if (!running) return;
    await drawSvgFrame(svgEl, canvas, ctx);
    if (running) timeoutHandle = setTimeout(drawLoop, 1000 / fps);
  }

  return {
    mimeType,

    start() {
      if (running) return;
      running = true;
      recorder.start();
      drawLoop();
    },

    /** Stops recording and resolves with the finished Blob. */
    stop() {
      return new Promise((resolve) => {
        if (!running) {
          resolve(null);
          return;
        }
        running = false;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        try {
          recorder.stop();
        } catch {
          resolve(new Blob(chunks, { type: mimeType })); // stop() can throw if the recorder was already inactive — the chunks captured so far are still valid
        }
      });
    },

    isRunning() {
      return running;
    },
  };
}

/** Triggers a browser download for a recorded Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on a delay, not immediately — some browsers need the download
  // to actually start reading the blob URL first.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Filesystem-safe filename base from two fighter names + a timestamp. */
export function recordingFilename(nameA, nameB, extension) {
  const clean = (s) => (s || "fighter").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "fighter";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `battle-${clean(nameA)}-vs-${clean(nameB)}-${stamp}.${extension}`;
}
