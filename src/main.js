/**
 * Subsea Detect v1.2
 *   • Live camera mode: real-time detection on webcam stream
 *   • Upload mode:      detect on any user-supplied video file
 *   • Three video outputs per session:
 *       - video_full.<ext>           full processed video with overlays
 *       - clips/<class>_<id>.<ext>   short clip around each detection event
 *       - dataset/<class>/*.png      per-frame PNG snapshots
 *
 * Output zip structure:
 *   subsea-capture-<timestamp>.zip
 *   └── subsea-capture/
 *       ├── video_full.mp4   (or .webm)
 *       ├── manifest.json
 *       ├── README.txt
 *       ├── clips/
 *       │   ├── fish_0001.mp4
 *       │   ├── person_0002.mp4
 *       │   └── unknown_0003.mp4
 *       └── dataset/
 *           ├── fish/0001_fish_0.87_<timestamp>.png
 *           ├── person/0002_person_0.95_<timestamp>.png
 *           └── unknown_detections/0003_unknown_0.51_<timestamp>.png
 */


const vid         = document.getElementById('vid');
const overlay     = document.getElementById('overlay');
const proc        = document.getElementById('proc');
const octx        = overlay.getContext('2d');
const pctx        = proc.getContext('2d', { willReadFrequently: true });

const statusEl    = document.getElementById('status');
const fpsEl       = document.getElementById('fps');
const countEl     = document.getElementById('objcount');
const savedEl     = document.getElementById('savedcount');
const clipCountEl = document.getElementById('clipcount');
const overlayMsg  = document.getElementById('overlay-msg');
const overlaySub  = document.getElementById('overlay-sub');
const detList     = document.getElementById('detections');
const hudMode     = document.getElementById('hud-mode');
const hudTime     = document.getElementById('hud-time');
const hudRec      = document.getElementById('hud-rec');
const foldersEl   = document.getElementById('dataset-folders');
const hintEl      = document.getElementById('dataset-hint');
const progressBar = document.getElementById('progress-bar');
const progressFill= document.getElementById('progress-fill');

// mode tabs + control rows
const modeLiveBtn   = document.getElementById('mode-live');
const modeUploadBtn = document.getElementById('mode-upload');
const ctrlsLive     = document.getElementById('controls-live');
const ctrlsUpload   = document.getElementById('controls-upload');

// live controls
const btnStart    = document.getElementById('btn-start');
const btnStop     = document.getElementById('btn-stop');
const btnSnap     = document.getElementById('btn-snap');
const btnRecord   = document.getElementById('btn-record');
const btnDownload = document.getElementById('btn-download');

// upload controls
const btnChoose       = document.getElementById('btn-choose');
const btnProcess      = document.getElementById('btn-process');
const btnStopUpload   = document.getElementById('btn-stop-upload');
const btnDownloadUp   = document.getElementById('btn-download-upload');
const fileInput       = document.getElementById('file-input');

// shared toggles + sliders
const uwToggle    = document.getElementById('uw-mode');
const uwToggleUp  = document.getElementById('uw-mode-upload');
const confSlider  = document.getElementById('conf');
const confOut     = document.getElementById('conf-val');
const redSlider   = document.getElementById('red');
const redOut      = document.getElementById('red-val');
const unkSlider   = document.getElementById('unk');
const unkOut      = document.getElementById('unk-val');
const rateSlider  = document.getElementById('rate');
const rateOut     = document.getElementById('rate-val');
const clipSlider  = document.getElementById('clip');
const clipOut     = document.getElementById('clip-val');
const gapSlider   = document.getElementById('gap');
const gapOut      = document.getElementById('gap-val');


let mode           = 'live';   // 'live' | 'upload'
let stream         = null;
let model          = null;
let running        = false;
let recording      = false;
let uploadVideoUrl = null;     // object URL for uploaded file

let lastFrameTime  = performance.now();
let frameCount     = 0;
let fpsAvg         = 0;
let startTime      = 0;
let saveIndex      = 0;
let clipIndex      = 0;

// Map<folderName, Array<{filename, blob, score, class, timestamp, bbox}>>
const dataset = new Map();
// Array<{filename, blob, class}>
const clips = [];

// Full-session recorder
let fullRecorder       = null;
let fullChunks         = [];
let fullMimeType       = '';
let fullExt            = 'webm';

// Per-detection clip recorder (separate from full recorder)
let clipRecorder       = null;
let clipChunks         = [];
let clipActive         = false;
let clipEndTimer       = null;
let clipMimeType       = '';
let clipExt            = 'webm';
let lastClipEndTime    = -Infinity;   // perf time at end of previous clip
let currentClipClass   = null;

// Composite canvas (proc + overlay), used as the source for all recordings
let compositeCanvas    = null;
let compositeCtx       = null;
let compositeStream    = null;


const PALETTE = [
  '#4ade80', '#fbbf24', '#f87171', '#60a5fa',
  '#c084fc', '#f472b6', '#34d399', '#fb923c'
];
const UNKNOWN_COLOR = '#ef4444';
const UNKNOWN_FOLDER = 'unknown_detections';

function colorFor(cls) {
  if (cls === 'unknown') return UNKNOWN_COLOR;
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `T+ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sanitizeName(s) {
  return s.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
}

function activeUwToggle() {
  return mode === 'upload' ? uwToggleUp : uwToggle;
}

/** Underwater color correction (Gray World + red-channel boost). */
function correctUnderwater(imageData, redBoost = 1.6) {
  const d = imageData.data;
  const n = d.length / 4;
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < d.length; i += 4) {
    rSum += d[i]; gSum += d[i + 1]; bSum += d[i + 2];
  }
  const rAvg = rSum / n, gAvg = gSum / n, bAvg = bSum / n;
  const gray = (rAvg + gAvg + bAvg) / 3;
  const rGain = (gray / Math.max(rAvg, 1)) * redBoost;
  const gGain =  gray / Math.max(gAvg, 1);
  const bGain = (gray / Math.max(bAvg, 1)) * 0.85;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, d[i]     * rGain);
    d[i + 1] = Math.min(255, d[i + 1] * gGain);
    d[i + 2] = Math.min(255, d[i + 2] * bGain);
  }
  return imageData;
}

function drawBox(ctx, x, y, w, h, color, label) {
  const cornerLen = Math.min(20, w / 4, h / 4);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + cornerLen);           ctx.lineTo(x, y);                       ctx.lineTo(x + cornerLen, y);
  ctx.moveTo(x + w - cornerLen, y);       ctx.lineTo(x + w, y);                   ctx.lineTo(x + w, y + cornerLen);
  ctx.moveTo(x + w, y + h - cornerLen);   ctx.lineTo(x + w, y + h);               ctx.lineTo(x + w - cornerLen, y + h);
  ctx.moveTo(x + cornerLen, y + h);       ctx.lineTo(x, y + h);                   ctx.lineTo(x, y + h - cornerLen);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.font = '600 14px ui-monospace, "SF Mono", Menlo, monospace';
  const padding = 5;
  const textWidth = ctx.measureText(label).width + padding * 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 20, textWidth, 18);
  ctx.fillStyle = '#02131f';
  ctx.fillText(label, x + padding, y - 6);
}



function pickMimeType() {
  const candidates = [
    { mime: 'video/mp4;codecs=h264,aac',                 ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',    ext: 'mp4' },
    { mime: 'video/mp4',                                  ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus',                ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus',                ext: 'webm' },
    { mime: 'video/webm',                                 ext: 'webm' }
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}


function ensureComposite(w, h) {
  if (compositeCanvas && compositeCanvas.width === w && compositeCanvas.height === h) return;
  compositeCanvas = document.createElement('canvas');
  compositeCanvas.width  = w;
  compositeCanvas.height = h;
  compositeCtx = compositeCanvas.getContext('2d');
  compositeStream = compositeCanvas.captureStream(30);
}

function paintComposite() {
  if (!compositeCtx) return;
  compositeCtx.drawImage(proc, 0, 0);
  compositeCtx.drawImage(overlay, 0, 0);
}



async function saveDetectionFrame(prediction, unknownThreshold) {
  const isUnknown = prediction.score < unknownThreshold;
  const className = isUnknown ? 'unknown' : prediction.class;
  const folder    = isUnknown ? UNKNOWN_FOLDER : sanitizeName(prediction.class);

  // composite proc + overlay
  const tmp = document.createElement('canvas');
  tmp.width  = proc.width;
  tmp.height = proc.height;
  const ctx  = tmp.getContext('2d');
  ctx.drawImage(proc, 0, 0);
  ctx.drawImage(overlay, 0, 0);

  const blob = await new Promise(r => tmp.toBlob(r, 'image/png'));
  if (!blob) return;

  saveIndex++;
  const filename =
    String(saveIndex).padStart(4, '0') +
    `_${className}_${prediction.score.toFixed(2)}_${timestamp()}.png`;

  if (!dataset.has(folder)) dataset.set(folder, []);
  dataset.get(folder).push({
    filename, blob,
    score: prediction.score,
    class: className,
    timestamp: new Date().toISOString(),
    bbox: prediction.bbox
  });

  savedEl.textContent = String(totalSaved());
  enableDownload(true);
  renderFolders();
}

function totalSaved() {
  let n = 0;
  for (const arr of dataset.values()) n += arr.length;
  return n;
}

function renderFolders() {
  if (dataset.size === 0 && clips.length === 0) {
    foldersEl.innerHTML = '';
    hintEl.style.display = '';
    return;
  }
  hintEl.style.display = 'none';

  const folders = Array.from(dataset.entries()).sort(([a], [b]) => {
    if (a === UNKNOWN_FOLDER) return 1;
    if (b === UNKNOWN_FOLDER) return -1;
    return a.localeCompare(b);
  });

  const cards = folders.map(([name, items]) => {
    const isUnknown = name === UNKNOWN_FOLDER;
    const color = isUnknown ? UNKNOWN_COLOR : colorFor(name);
    const icon  = isUnknown ? '❓' : '📁';
    return `
      <div class="folder-card" style="border-color: ${color}33;">
        <div class="folder-icon" style="color:${color};">${icon}</div>
        <div class="folder-meta">
          <div class="folder-name">${name}/</div>
          <div class="folder-count">${items.length} frame${items.length === 1 ? '' : 's'}</div>
        </div>
      </div>
    `;
  });

  if (clips.length > 0) {
    cards.unshift(`
      <div class="folder-card" style="border-color: #60a5fa55;">
        <div class="folder-icon" style="color:#60a5fa;">🎬</div>
        <div class="folder-meta">
          <div class="folder-name">clips/</div>
          <div class="folder-count">${clips.length} clip${clips.length === 1 ? '' : 's'}</div>
        </div>
      </div>
    `);
  }

  foldersEl.innerHTML = cards.join('');
}



function startFullRecording() {
  if (!compositeStream) return false;
  const choice = pickMimeType();
  if (!choice) {
    statusEl.textContent = 'Video recording not supported in this browser.';
    return false;
  }
  fullMimeType = choice.mime;
  fullExt      = choice.ext;
  fullChunks   = [];
  try {
    fullRecorder = new MediaRecorder(compositeStream, {
      mimeType: choice.mime,
      videoBitsPerSecond: 2_500_000
    });
  } catch (e) {
    statusEl.textContent = `Recorder failed: ${e.message}`;
    return false;
  }
  fullRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) fullChunks.push(e.data);
  };
  fullRecorder.start(1000);
  return true;
}

function stopFullRecording() {
  return new Promise(resolve => {
    if (!fullRecorder || fullRecorder.state === 'inactive') {
      resolve(null);
      return;
    }
    fullRecorder.onstop = () => {
      const blob = fullChunks.length > 0
        ? new Blob(fullChunks, { type: fullMimeType })
        : null;
      resolve(blob);
    };
    fullRecorder.stop();
  });
}


function startClipRecording(className) {
  if (clipActive || !compositeStream) return;
  const now = performance.now();
  const gapMs = parseInt(gapSlider.value, 10) * 1000;
  if (now - lastClipEndTime < gapMs) return;     // respect min-gap

  const choice = pickMimeType();
  if (!choice) return;
  clipMimeType = choice.mime;
  clipExt      = choice.ext;
  clipChunks   = [];
  currentClipClass = className;

  try {
    clipRecorder = new MediaRecorder(compositeStream, {
      mimeType: choice.mime,
      videoBitsPerSecond: 2_500_000
    });
  } catch (_) { return; }

  clipRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) clipChunks.push(e.data);
  };
  clipRecorder.onstop = () => {
    if (clipChunks.length > 0) {
      clipIndex++;
      const folder = currentClipClass === 'unknown' ? 'unknown' : sanitizeName(currentClipClass);
      const filename = `${folder}_${String(clipIndex).padStart(4, '0')}.${clipExt}`;
      clips.push({
        filename,
        blob: new Blob(clipChunks, { type: clipMimeType }),
        class: currentClipClass
      });
      clipCountEl.textContent = String(clips.length);
      renderFolders();
      enableDownload(true);
    }
    clipActive   = false;
    lastClipEndTime = performance.now();
  };

  clipRecorder.start();
  clipActive = true;

  // auto-stop after clip-length seconds
  const lenMs = parseInt(clipSlider.value, 10) * 1000;
  clearTimeout(clipEndTimer);
  clipEndTimer = setTimeout(() => {
    if (clipRecorder && clipRecorder.state !== 'inactive') {
      try { clipRecorder.stop(); } catch (_) {}
    }
  }, lenMs);
}

function forceStopClip() {
  clearTimeout(clipEndTimer);
  if (clipRecorder && clipRecorder.state !== 'inactive') {
    try { clipRecorder.stop(); } catch (_) {}
  }
}


function enableDownload(on) {
  btnDownload.disabled    = !on;
  btnDownloadUp.disabled  = !on;
}

async function downloadDataset() {
  if (totalSaved() === 0 && clips.length === 0 && fullChunks.length === 0) {
    statusEl.textContent = 'Nothing captured yet.';
    return;
  }

  statusEl.textContent = 'Building zip…';
  enableDownload(false);

  // stop any in-flight recordings
  forceStopClip();
  let fullBlob = null;
  if (fullRecorder && fullRecorder.state !== 'inactive') {
    fullBlob = await stopFullRecording();
  } else if (fullChunks.length > 0) {
    fullBlob = new Blob(fullChunks, { type: fullMimeType });
  }

  const zip = new JSZip();
  const root = zip.folder('subsea-capture');

  // 1. full video
  if (fullBlob) {
    root.file(`video_full.${fullExt}`, fullBlob);
  }

  // 2. clips
  if (clips.length > 0) {
    const clipsRoot = root.folder('clips');
    for (const c of clips) clipsRoot.file(c.filename, c.blob);
  }

  // 3. dataset folders
  const datasetRoot = root.folder('dataset');
  const manifest = {
    created:     new Date().toISOString(),
    mode,
    totalFrames: totalSaved(),
    classes:     {},
    clips:       clips.map(c => ({ filename: c.filename, class: c.class })),
    videoFile:   fullBlob ? `video_full.${fullExt}` : null,
    videoCodec:  fullBlob ? fullMimeType : null
  };
  for (const [folder, items] of dataset.entries()) {
    const sub = datasetRoot.folder(folder);
    manifest.classes[folder] = items.length;
    for (const item of items) sub.file(item.filename, item.blob);
  }

  // 4. metadata + README
  root.file('manifest.json', JSON.stringify(manifest, null, 2));
  root.file('README.txt',
`SUBSEA-DET capture bundle
Created:  ${manifest.created}
Mode:     ${mode}
Total detection frames: ${manifest.totalFrames}
Total clips: ${clips.length}
${fullBlob ? `Full video: video_full.${fullExt} (${fullMimeType})\n` : ''}
Folder structure:
  video_full.${fullExt}             complete session, overlays burned in
  clips/<class>_NNNN.${clipExt}        short clip per detection event
  dataset/<class>/             PNG frames per known class
  dataset/unknown_detections/  low-confidence frames \u2014 likely novel objects

Use the unknown_detections folder + clips for fine-tuning a custom
YOLO model on your real environment.

Class counts:
${Object.entries(manifest.classes).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  (none)'}
`);

  const zipBlob = await zip.generateAsync({ type: 'blob' }, m => {
    statusEl.textContent = `Zipping… ${m.percent.toFixed(0)}%`;
  });

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subsea-capture-${timestamp()}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  statusEl.textContent = `Downloaded ${a.download}`;
  enableDownload(true);
}


async function ensureModel() {
  if (model) return true;
  statusEl.textContent = 'Loading detection model…';
  try {
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return true;
  } catch (e) {
    statusEl.textContent = `Model failed to load: ${e.message}`;
    return false;
  }
}


async function startLive() {
  if (running) return;
  if (!(await ensureModel())) return;

  // Reset the <video> element completely — if upload mode was used previously,
  // vid.src will be set, and that conflicts with srcObject. Also clear any
  // lingering metadata handlers from upload mode.
  vid.onloadedmetadata = null;
  vid.onended = null;
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
  vid.muted = true;
  vid.playsInline = true;

  statusEl.textContent = 'Requesting camera…';

  // Try environment camera first (rear on mobile), then fall back to any camera.
  // Laptops typically only have a front camera and the 'environment' request
  // returns an OverconstrainedError, not a graceful fallback, in some browsers.
  let attempts = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
    { video: true, audio: false }
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      lastError = e;
      console.warn('getUserMedia failed for', constraints, e);
      stream = null;
    }
  }

  if (!stream) {
    const msg = lastError ? `${lastError.name}: ${lastError.message}` : 'no camera available';
    statusEl.textContent = `Camera failed — ${msg}. Check browser permissions.`;
    return;
  }

  try {
    vid.srcObject = stream;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('metadata timeout')), 5000);
      vid.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
    });
    await vid.play();
  } catch (e) {
    console.error('Video element setup failed:', e);
    statusEl.textContent = `Camera attached but won't play: ${e.message}`;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    return;
  }

  vid.style.transform = 'scaleX(-1)';     // mirror live view
  overlay.width = proc.width = vid.videoWidth || 640;
  overlay.height = proc.height = vid.videoHeight || 480;
  ensureComposite(overlay.width, overlay.height);

  overlayMsg.style.display = 'none';
  running = true;
  startTime = performance.now();
  btnStart.disabled = true;
  btnStop.disabled = false;
  btnSnap.disabled = false;
  btnRecord.disabled = false;
  statusEl.textContent = 'Live detection — press Record to save video + frames + clips';
  hudMode.textContent  = 'MODE: LIVE';
  loop();
}

async function stopLive() {
  running = false;
  if (recording) {
    forceStopClip();
    await stopFullRecording();
    recording = false;
    hudRec.hidden = true;
    btnRecord.textContent = '⏺ Record';
    btnRecord.classList.remove('btn-rec');
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  vid.srcObject = null;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  overlayMsg.style.display = '';
  btnStart.disabled = false;
  btnStop.disabled = true;
  btnSnap.disabled = true;
  btnRecord.disabled = true;
  hudMode.textContent = 'MODE: STANDBY';
  countEl.textContent = '0';
  fpsEl.textContent   = '—';
  statusEl.textContent = 'Stopped. Data preserved — Download dataset when ready.';
}

 

function chooseFile() {
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  if (uploadVideoUrl) URL.revokeObjectURL(uploadVideoUrl);
  uploadVideoUrl = URL.createObjectURL(f);

  // Fully reset the video element before assigning a new source.
  vid.onloadedmetadata = null;
  vid.onended = null;
  vid.pause();
  vid.srcObject = null;
  vid.style.transform = 'none';
  vid.muted = true;
  vid.controls = false;
  vid.src = uploadVideoUrl;
  vid.load();

  vid.onloadedmetadata = () => {
    overlayMsg.style.display = '';
    overlaySub.textContent = `loaded "${f.name}" — press Process to begin`;
    btnProcess.disabled = false;
    statusEl.textContent = `Loaded: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB, ${Math.round(vid.duration)}s)`;
  };
});

async function startUpload() {
  if (!uploadVideoUrl) {
    statusEl.textContent = 'Choose a video file first.';
    return;
  }
  if (!(await ensureModel())) return;

  overlay.width = proc.width = vid.videoWidth;
  overlay.height = proc.height = vid.videoHeight;
  ensureComposite(vid.videoWidth, vid.videoHeight);

  overlayMsg.style.display = 'none';
  progressBar.hidden = false;
  progressFill.style.width = '0%';

  running   = true;
  recording = true;   // auto-record on upload
  startTime = performance.now();
  hudMode.textContent = 'MODE: UPLOAD';
  hudRec.hidden = false;
  statusEl.textContent = 'Processing video…';

  btnProcess.disabled    = true;
  btnStopUpload.disabled = false;
  btnChoose.disabled     = true;

  startFullRecording();

  vid.currentTime = 0;
  await vid.play();
  vid.onended = async () => {
    progressFill.style.width = '100%';
    await finishUpload();
  };

  loop();
}

async function stopUpload() {
  if (!running) return;
  running   = false;
  await finishUpload();
}

async function finishUpload() {
  forceStopClip();
  if (fullRecorder && fullRecorder.state !== 'inactive') {
    await stopFullRecording();
  }
  recording = false;
  hudRec.hidden = true;
  progressBar.hidden = true;
  hudMode.textContent = 'MODE: STANDBY';
  btnProcess.disabled    = !uploadVideoUrl;
  btnStopUpload.disabled = true;
  btnChoose.disabled     = false;
  if (!vid.paused) vid.pause();
  statusEl.textContent = `Processing complete. ${totalSaved()} frames + ${clips.length} clips captured.`;
}



async function loop() {
  if (!running) return;

  const now = performance.now();
  const dt  = now - lastFrameTime;
  lastFrameTime = now;
  frameCount++;
  fpsAvg = fpsAvg ? fpsAvg * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  if (frameCount % 5 === 0) fpsEl.textContent = fpsAvg.toFixed(1);
  hudTime.textContent = fmtTime((now - startTime) / 1000);

  // draw current video frame into proc canvas
  if (mode === 'live') {
    pctx.save();
    pctx.scale(-1, 1);
    pctx.drawImage(vid, -proc.width, 0, proc.width, proc.height);
    pctx.restore();
  } else {
    pctx.drawImage(vid, 0, 0, proc.width, proc.height);
    if (vid.duration > 0) {
      progressFill.style.width = `${(vid.currentTime / vid.duration) * 100}%`;
    }
  }

  if (activeUwToggle().checked) {
    const img = pctx.getImageData(0, 0, proc.width, proc.height);
    correctUnderwater(img, redSlider.value / 10);
    pctx.putImageData(img, 0, 0);
  }

  const threshold        = confSlider.value / 100;
  const unknownThreshold = unkSlider.value / 100;
  const saveEveryN       = parseInt(rateSlider.value, 10);

  let predictions = [];
  try { predictions = await model.detect(proc, 20, threshold); } catch (_) {}

  octx.clearRect(0, 0, overlay.width, overlay.height);
  const lines = [];
  let visible = 0;
  let topDetection = null;

  for (const p of predictions) {
    if (p.score < threshold) continue;
    visible++;
    const [x, y, w, h] = p.bbox;
    const isUnknown = p.score < unknownThreshold;
    const cls   = isUnknown ? 'unknown' : p.class;
    const color = isUnknown ? UNKNOWN_COLOR : colorFor(p.class);
    const label = `${cls.toUpperCase()} ${(p.score * 100).toFixed(0)}%`;
    drawBox(octx, x, y, w, h, color, label);
    if (!topDetection || p.score > topDetection.score) {
      topDetection = { ...p, _cls: cls };
    }
    lines.push(
      `<div style="color:${color};">▸ ${cls.padEnd(14, ' ')} ` +
      `${(p.score * 100).toFixed(1).padStart(5, ' ')}%  ` +
      `bbox(${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)})` +
      (isUnknown ? '  → unknown_detections/' : '') +
      `</div>`
    );
  }

  // paint composite (used by recorder + clip recorder)
  paintComposite();

  // save frames at the configured rate (when recording)
  if (recording && visible > 0 && frameCount % saveEveryN === 0) {
    for (const p of predictions) {
      if (p.score < threshold) continue;
      saveDetectionFrame(p, unknownThreshold);
    }
  }

  // trigger per-detection clip when an object is present
  if (recording && topDetection && !clipActive) {
    startClipRecording(topDetection._cls);
  }

  countEl.textContent = visible;
  detList.innerHTML = lines.length
    ? lines.join('')
    : '<div class="muted">// scanning… no objects above threshold</div>';

  requestAnimationFrame(loop);
}

 

function captureSnapshot() {
  const out = document.createElement('canvas');
  out.width = overlay.width;
  out.height = overlay.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(proc, 0, 0);
  ctx.drawImage(overlay, 0, 0);
  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subsea-snap-${timestamp()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

 

function setMode(newMode) {
  if (newMode === mode) return;
  if (running) {
    statusEl.textContent = 'Stop the current session before switching modes.';
    return;
  }
  mode = newMode;
  modeLiveBtn  .classList.toggle('active', mode === 'live');
  modeUploadBtn.classList.toggle('active', mode === 'upload');
  ctrlsLive   .hidden = mode !== 'live';
  ctrlsUpload .hidden = mode !== 'upload';

  // Fully reset the <video> element so we never have leftover src/srcObject
  // from the previous mode (this was causing the camera-stuck-black bug).
  vid.onloadedmetadata = null;
  vid.onended = null;
  vid.pause();
  vid.srcObject = null;
  vid.removeAttribute('src');
  vid.load();

  octx.clearRect(0, 0, overlay.width, overlay.height);
  overlayMsg.style.display = '';
  if (mode === 'live') {
    overlaySub.textContent = 'press Start camera to begin live detection';
    vid.style.transform = 'scaleX(-1)';
  } else {
    overlaySub.textContent = 'choose a video file to begin';
    vid.style.transform = 'none';
  }
  statusEl.textContent = mode === 'live'
    ? 'Live mode — press Start camera'
    : 'Upload mode — choose a video file';
}

 
modeLiveBtn  .addEventListener('click', () => setMode('live'));
modeUploadBtn.addEventListener('click', () => setMode('upload'));

btnStart   .addEventListener('click', startLive);
btnStop    .addEventListener('click', stopLive);
btnSnap    .addEventListener('click', captureSnapshot);
btnDownload.addEventListener('click', downloadDataset);

btnRecord.addEventListener('click', () => {
  if (!recording) {
    if (startFullRecording()) {
      recording = true;
      hudRec.hidden = false;
      btnRecord.textContent = '⏹ Stop recording';
      btnRecord.classList.add('btn-rec');
      statusEl.textContent = `Recording (${fullExt.toUpperCase()}) — full video + frames + clips`;
      enableDownload(true);
    }
  } else {
    forceStopClip();
    stopFullRecording();
    recording = false;
    hudRec.hidden = true;
    btnRecord.textContent = '⏺ Record';
    btnRecord.classList.remove('btn-rec');
    statusEl.textContent = 'Recording stopped — Download dataset when ready.';
  }
});

btnChoose       .addEventListener('click', chooseFile);
btnProcess      .addEventListener('click', startUpload);
btnStopUpload   .addEventListener('click', stopUpload);
btnDownloadUp   .addEventListener('click', downloadDataset);

// sync the two underwater toggles
uwToggle  .addEventListener('change', () => { uwToggleUp.checked = uwToggle.checked; });
uwToggleUp.addEventListener('change', () => { uwToggle.checked   = uwToggleUp.checked; });

confSlider.addEventListener('input', () => confOut.textContent = (confSlider.value / 100).toFixed(2));
redSlider .addEventListener('input', () => redOut .textContent = (redSlider.value / 10).toFixed(1) + 'x');
unkSlider .addEventListener('input', () => unkOut .textContent = (unkSlider.value / 100).toFixed(2));
rateSlider.addEventListener('input', () => rateOut.textContent = rateSlider.value);
clipSlider.addEventListener('input', () => clipOut.textContent = clipSlider.value);
gapSlider .addEventListener('input', () => gapOut .textContent = gapSlider.value);

// initial mode
setMode('live');
