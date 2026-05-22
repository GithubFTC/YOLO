/**
 * Subsea Detect v1.1 — live underwater detection + dataset capture + MP4 recording
 *
 * Features:
 *   • Live YOLO-style object detection (COCO-SSD via TF.js)
 *   • Underwater color correction (Gray World + red boost)
 *   • Frame-by-frame dataset capture, auto-organized into folders by class
 *   • "unknown_detections/" folder for low-confidence (likely novel) objects
 *   • Continuous MP4 video recording of the session (with WebM fallback)
 *   • Single zip download containing /dataset/<class>/<frame>.png + video file
 *
 * Output zip structure:
 *   subsea-capture-<timestamp>.zip
 *   └── subsea-capture/
 *       ├── video.mp4               (or .webm if browser can't do mp4)
 *       ├── manifest.json
 *       ├── README.txt
 *       └── dataset/
 *           ├── fish/0001_fish_0.87_<timestamp>.png
 *           ├── person/0002_person_0.95_<timestamp>.png
 *           └── unknown_detections/0003_unknown_0.51_<timestamp>.png
 */

// ---------- DOM ----------
const vid         = document.getElementById('vid');
const overlay     = document.getElementById('overlay');
const proc        = document.getElementById('proc');
const octx        = overlay.getContext('2d');
const pctx        = proc.getContext('2d', { willReadFrequently: true });

const statusEl    = document.getElementById('status');
const fpsEl       = document.getElementById('fps');
const countEl     = document.getElementById('objcount');
const savedEl     = document.getElementById('savedcount');
const modelEl     = document.getElementById('modelname');
const overlayMsg  = document.getElementById('overlay-msg');
const detList     = document.getElementById('detections');
const hudMode     = document.getElementById('hud-mode');
const hudTime     = document.getElementById('hud-time');
const hudRec      = document.getElementById('hud-rec');
const foldersEl   = document.getElementById('dataset-folders');
const hintEl      = document.getElementById('dataset-hint');

const btnStart    = document.getElementById('btn-start');
const btnStop     = document.getElementById('btn-stop');
const btnSnap     = document.getElementById('btn-snap');
const btnRecord   = document.getElementById('btn-record');
const btnDownload = document.getElementById('btn-download');
const uwToggle    = document.getElementById('uw-mode');
const confSlider  = document.getElementById('conf');
const confOut     = document.getElementById('conf-val');
const redSlider   = document.getElementById('red');
const redOut      = document.getElementById('red-val');
const unkSlider   = document.getElementById('unk');
const unkOut      = document.getElementById('unk-val');
const rateSlider  = document.getElementById('rate');
const rateOut     = document.getElementById('rate-val');

// ---------- state ----------
let stream         = null;
let model          = null;
let running        = false;
let recording      = false;
let lastFrameTime  = performance.now();
let frameCount     = 0;
let fpsAvg         = 0;
let startTime      = 0;
let saveIndex      = 0;

// Map<folderName, Array<{filename, blob, score, class, timestamp, bbox}>>
const dataset = new Map();

// MediaRecorder for the video file
let recorder         = null;
let recordedChunks   = [];
let recordedMimeType = '';
let recordedExtension = 'webm';

// ---------- helpers ----------
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

// ---------- dataset capture ----------

/**
 * Save a detection's frame (with overlay burned in) into the in-memory dataset.
 * Auto-routes low-confidence detections to "unknown_detections/".
 */
async function saveDetectionFrame(prediction, unknownThreshold) {
  const isUnknown = prediction.score < unknownThreshold;
  const className = isUnknown ? 'unknown' : prediction.class;
  const folder    = isUnknown ? UNKNOWN_FOLDER : sanitizeName(prediction.class);

  // composite the corrected video frame + the detection overlay
  const composite = document.createElement('canvas');
  composite.width  = proc.width;
  composite.height = proc.height;
  const cctx = composite.getContext('2d');
  cctx.drawImage(proc, 0, 0);
  cctx.drawImage(overlay, 0, 0);

  const blob = await new Promise(r => composite.toBlob(r, 'image/png'));
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
  btnDownload.disabled = false;
  renderFolders();
}

function totalSaved() {
  let n = 0;
  for (const arr of dataset.values()) n += arr.length;
  return n;
}

function renderFolders() {
  if (dataset.size === 0) {
    foldersEl.innerHTML = '';
    hintEl.style.display = '';
    return;
  }
  hintEl.style.display = 'none';

  const folders = Array.from(dataset.entries()).sort(([a], [b]) => {
    if (a === UNKNOWN_FOLDER) return 1;   // unknown always last
    if (b === UNKNOWN_FOLDER) return -1;
    return a.localeCompare(b);
  });

  foldersEl.innerHTML = folders.map(([name, items]) => {
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
  }).join('');
}

// ---------- video recording (MP4 preferred, WebM fallback) ----------

function pickRecorderMimeType() {
  // Browser support for MP4 recording: Chrome 126+, Edge 126+, Safari (all recent).
  // Firefox: WebM only.
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

function startRecording() {
  // Build a composite stream: corrected video + detection overlay.
  // We can't record `proc` or `overlay` directly because we want them combined.
  const composite = document.createElement('canvas');
  composite.width  = proc.width;
  composite.height = proc.height;
  const cctx = composite.getContext('2d');
  const compositeStream = composite.captureStream(30); // 30 fps target

  function tick() {
    if (!recording) return;
    cctx.drawImage(proc, 0, 0);
    cctx.drawImage(overlay, 0, 0);
    requestAnimationFrame(tick);
  }

  const choice = pickRecorderMimeType();
  if (!choice) {
    statusEl.textContent = 'Video recording not supported in this browser.';
    return false;
  }
  recordedMimeType  = choice.mime;
  recordedExtension = choice.ext;
  recordedChunks    = [];

  try {
    recorder = new MediaRecorder(compositeStream, {
      mimeType: choice.mime,
      videoBitsPerSecond: 2_500_000
    });
  } catch (e) {
    statusEl.textContent = `Recorder failed: ${e.message}`;
    return false;
  }

  recorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.start(1000); // emit a chunk every second

  recording = true;
  hudRec.hidden = false;
  btnRecord.textContent = '⏹ Stop recording';
  btnRecord.classList.add('btn-rec');
  btnDownload.disabled = false;
  tick();
  return true;
}

function stopRecording() {
  return new Promise(resolve => {
    if (!recorder || recorder.state === 'inactive') {
      recording = false;
      hudRec.hidden = true;
      btnRecord.textContent = '⏺ Record';
      btnRecord.classList.remove('btn-rec');
      resolve(null);
      return;
    }
    recorder.onstop = () => {
      recording = false;
      hudRec.hidden = true;
      btnRecord.textContent = '⏺ Record';
      btnRecord.classList.remove('btn-rec');
      const blob = new Blob(recordedChunks, { type: recordedMimeType });
      resolve(blob);
    };
    recorder.stop();
  });
}

// ---------- dataset download (zip) ----------

async function downloadDataset() {
  if (totalSaved() === 0 && recordedChunks.length === 0) {
    statusEl.textContent = 'Nothing captured yet.';
    return;
  }

  statusEl.textContent = 'Building zip…';
  btnDownload.disabled = true;

  const zip = new JSZip();
  const root = zip.folder('subsea-capture');

  // 1. video — stop recording if still active, then include
  let videoBlob = null;
  if (recording) {
    videoBlob = await stopRecording();
  } else if (recordedChunks.length > 0) {
    videoBlob = new Blob(recordedChunks, { type: recordedMimeType });
  }
  if (videoBlob) {
    root.file(`video.${recordedExtension}`, videoBlob);
  }

  // 2. dataset folders
  const datasetRoot = root.folder('dataset');
  const manifest = {
    created:     new Date().toISOString(),
    totalFrames: totalSaved(),
    classes:     {},
    videoFile:   videoBlob ? `video.${recordedExtension}` : null,
    videoCodec:  videoBlob ? recordedMimeType : null
  };

  for (const [folder, items] of dataset.entries()) {
    const sub = datasetRoot.folder(folder);
    manifest.classes[folder] = items.length;
    for (const item of items) {
      sub.file(item.filename, item.blob);
    }
  }

  // 3. metadata + README
  root.file('manifest.json', JSON.stringify(manifest, null, 2));
  root.file('README.txt',
`SUBSEA-DET capture bundle
Created: ${manifest.created}
Total detection frames: ${manifest.totalFrames}
${videoBlob ? `Video file: video.${recordedExtension} (${recordedMimeType})\n` : ''}
Folder structure:
  video.${recordedExtension}                continuous session recording
  dataset/<class>/             frames where a known class was detected
  dataset/unknown_detections/  low-confidence detections — likely novel objects

These frames can be used as training data for fine-tuning a custom
YOLO model. The "unknown_detections" folder contains the most valuable
samples: the model saw something but couldn't classify it confidently.

Class counts:
${Object.entries(manifest.classes).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  (none yet)'}
`);

  // 4. generate + download
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
  btnDownload.disabled = false;
}

// ---------- camera + model lifecycle ----------

async function start() {
  if (running) return;
  statusEl.textContent = 'Loading detection model…';
  try {
    if (!model) {
      model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      modelEl.textContent = 'COCO-SSD';
    }
  } catch (e) {
    statusEl.textContent = `Model failed to load: ${e.message}`;
    return;
  }

  statusEl.textContent = 'Requesting camera…';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width:  { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
    vid.srcObject = stream;
    await new Promise(resolve => (vid.onloadedmetadata = resolve));
    await vid.play();
  } catch (e) {
    statusEl.textContent = 'Camera denied or unavailable. Allow access and retry.';
    return;
  }

  overlay.width  = vid.videoWidth;
  overlay.height = vid.videoHeight;
  proc.width     = vid.videoWidth;
  proc.height    = vid.videoHeight;

  overlayMsg.style.display = 'none';
  running        = true;
  startTime      = performance.now();
  btnStart.disabled  = true;
  btnStop.disabled   = false;
  btnSnap.disabled   = false;
  btnRecord.disabled = false;
  statusEl.textContent = 'Detection active — press Record to start saving frames + video';
  hudMode.textContent  = 'MODE: LIVE';
  loop();
}

async function stop() {
  running = false;
  if (recording) await stopRecording();
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  vid.srcObject = null;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  overlayMsg.style.display = '';
  btnStart.disabled  = false;
  btnStop.disabled   = true;
  btnSnap.disabled   = true;
  btnRecord.disabled = true;
  statusEl.textContent  = 'Stopped. Captured data is preserved — use Download dataset when ready.';
  hudMode.textContent   = 'MODE: STANDBY';
  countEl.textContent   = '0';
  fpsEl.textContent     = '—';
  detList.innerHTML     = '<div class="muted">// detections appear here when camera is active</div>';
}

// ---------- per-frame detection loop ----------

async function loop() {
  if (!running) return;

  const now = performance.now();
  const dt  = now - lastFrameTime;
  lastFrameTime = now;
  frameCount++;
  fpsAvg = fpsAvg ? fpsAvg * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  if (frameCount % 5 === 0) fpsEl.textContent = fpsAvg.toFixed(1);
  hudTime.textContent = fmtTime((now - startTime) / 1000);

  pctx.save();
  pctx.scale(-1, 1);
  pctx.drawImage(vid, -proc.width, 0, proc.width, proc.height);
  pctx.restore();

  if (uwToggle.checked) {
    const img = pctx.getImageData(0, 0, proc.width, proc.height);
    correctUnderwater(img, redSlider.value / 10);
    pctx.putImageData(img, 0, 0);
  }

  const threshold        = confSlider.value / 100;
  const unknownThreshold = unkSlider.value / 100;
  const saveEveryN       = parseInt(rateSlider.value, 10);

  let predictions = [];
  try {
    predictions = await model.detect(proc, 20, threshold);
  } catch (_) { /* ignore transient inference errors */ }

  octx.clearRect(0, 0, overlay.width, overlay.height);
  const lines = [];
  let visible = 0;

  for (const p of predictions) {
    if (p.score < threshold) continue;
    visible++;
    const [x, y, w, h] = p.bbox;
    const isUnknown = p.score < unknownThreshold;
    const cls   = isUnknown ? 'unknown' : p.class;
    const color = isUnknown ? UNKNOWN_COLOR : colorFor(p.class);
    const label = `${cls.toUpperCase()} ${(p.score * 100).toFixed(0)}%`;
    drawBox(octx, x, y, w, h, color, label);

    lines.push(
      `<div style="color:${color};">▸ ${cls.padEnd(14, ' ')} ` +
      `${(p.score * 100).toFixed(1).padStart(5, ' ')}%  ` +
      `bbox(${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)})` +
      (isUnknown ? '  → unknown_detections/' : '') +
      `</div>`
    );
  }

  // save frames at the configured rate, only while recording
  if (recording && visible > 0 && frameCount % saveEveryN === 0) {
    for (const p of predictions) {
      if (p.score < threshold) continue;
      saveDetectionFrame(p, unknownThreshold);
    }
  }

  countEl.textContent = visible;
  detList.innerHTML = lines.length
    ? lines.join('')
    : '<div class="muted">// scanning… no objects above threshold</div>';

  requestAnimationFrame(loop);
}

// ---------- single-frame capture (still works as before) ----------

function captureFrame() {
  const out = document.createElement('canvas');
  out.width  = overlay.width;
  out.height = overlay.height;
  const ctx  = out.getContext('2d');
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

// ---------- wire up controls ----------

btnStart   .addEventListener('click', start);
btnStop    .addEventListener('click', stop);
btnSnap    .addEventListener('click', captureFrame);
btnDownload.addEventListener('click', downloadDataset);

btnRecord.addEventListener('click', async () => {
  if (!recording) {
    if (startRecording()) {
      statusEl.textContent = `Recording video (${recordedExtension.toUpperCase()}) + capturing frames…`;
    }
  } else {
    await stopRecording();
    statusEl.textContent = 'Recording stopped — download when ready.';
  }
});

confSlider.addEventListener('input', () => {
  confOut.textContent = (confSlider.value / 100).toFixed(2);
});
redSlider.addEventListener('input', () => {
  redOut.textContent = (redSlider.value / 10).toFixed(1) + 'x';
});
unkSlider.addEventListener('input', () => {
  unkOut.textContent = (unkSlider.value / 100).toFixed(2);
});
rateSlider.addEventListener('input', () => {
  rateOut.textContent = rateSlider.value;
});
