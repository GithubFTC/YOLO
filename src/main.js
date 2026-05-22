
/**
 * Subsea Detect — live underwater object detection in the browser.
 *
 * Pipeline:
 *   webcam → processing canvas → underwater color correction
 *          → COCO-SSD inference → bounding-box overlay
 *
 * All inference runs locally via TensorFlow.js. No frames leave the device.
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
const modelEl     = document.getElementById('modelname');
const overlayMsg  = document.getElementById('overlay-msg');
const detList     = document.getElementById('detections');
const hudMode     = document.getElementById('hud-mode');
const hudTime     = document.getElementById('hud-time');

const btnStart    = document.getElementById('btn-start');
const btnStop     = document.getElementById('btn-stop');
const btnSnap     = document.getElementById('btn-snap');
const uwToggle    = document.getElementById('uw-mode');
const confSlider  = document.getElementById('conf');
const confOut     = document.getElementById('conf-val');
const redSlider   = document.getElementById('red');
const redOut      = document.getElementById('red-val');

// ---------- state ----------
let stream         = null;
let model          = null;
let running        = false;
let lastFrameTime  = performance.now();
let frameCount     = 0;
let fpsAvg         = 0;
let startTime      = 0;

// ---------- helpers ----------
const PALETTE = [
  '#4ade80', '#fbbf24', '#f87171', '#60a5fa',
  '#c084fc', '#f472b6', '#34d399', '#fb923c'
];

function colorFor(cls) {
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `T+ ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Underwater color correction.
 *
 * Water absorbs red wavelengths within a few meters of depth, leaving
 * the familiar blue-green cast. Object detectors trained on surface
 * imagery degrade badly on this. We restore neutrality using the
 * Gray World assumption (the average scene color should be neutral)
 * and apply an extra boost to the red channel.
 *
 * @param {ImageData} imageData
 * @param {number} redBoost - multiplicative gain on the red channel (default 1.6)
 * @returns {ImageData}
 */
function correctUnderwater(imageData, redBoost = 1.6) {
  const d = imageData.data;
  const n = d.length / 4;

  // 1. compute per-channel means
  let rSum = 0, gSum = 0, bSum = 0;
  for (let i = 0; i < d.length; i += 4) {
    rSum += d[i];
    gSum += d[i + 1];
    bSum += d[i + 2];
  }
  const rAvg = rSum / n;
  const gAvg = gSum / n;
  const bAvg = bSum / n;
  const gray = (rAvg + gAvg + bAvg) / 3;

  // 2. per-channel gain to restore neutrality
  const rGain = (gray / Math.max(rAvg, 1)) * redBoost;
  const gGain =  gray / Math.max(gAvg, 1);
  const bGain = (gray / Math.max(bAvg, 1)) * 0.85; // tame the blue cast

  // 3. apply
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.min(255, d[i]     * rGain);
    d[i + 1] = Math.min(255, d[i + 1] * gGain);
    d[i + 2] = Math.min(255, d[i + 2] * bGain);
  }
  return imageData;
}

/**
 * Draw sci-fi corner brackets around a detection box.
 */
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

  // faint full-rect outline
  ctx.globalAlpha = 0.35;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;

  // label tag
  ctx.font = '600 14px ui-monospace, "SF Mono", Menlo, monospace';
  const padding = 5;
  const textWidth = ctx.measureText(label).width + padding * 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 20, textWidth, 18);
  ctx.fillStyle = '#02131f';
  ctx.fillText(label, x + padding, y - 6);
}

// ---------- camera + model lifecycle ----------
async function start() {
  if (running) return;

  statusEl.textContent = 'Loading detection model…';
  try {
    if (!model) {
      // lite_mobilenet_v2 is a YOLO-style single-shot detector, ~10MB
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
  btnStart.disabled = true;
  btnStop.disabled  = false;
  btnSnap.disabled  = false;
  statusEl.textContent = 'Detection active';
  hudMode.textContent  = 'MODE: LIVE';
  loop();
}

function stop() {
  running = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  vid.srcObject = null;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  overlayMsg.style.display = '';
  btnStart.disabled = false;
  btnStop.disabled  = true;
  btnSnap.disabled  = true;
  statusEl.textContent  = 'Stopped';
  hudMode.textContent   = 'MODE: STANDBY';
  countEl.textContent   = '0';
  fpsEl.textContent     = '—';
  detList.innerHTML     = '<div class="muted">// detections appear here when camera is active</div>';
}

// ---------- per-frame detection loop ----------
async function loop() {
  if (!running) return;

  // FPS bookkeeping
  const now = performance.now();
  const dt  = now - lastFrameTime;
  lastFrameTime = now;
  frameCount++;
  fpsAvg = fpsAvg ? fpsAvg * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  if (frameCount % 5 === 0) fpsEl.textContent = fpsAvg.toFixed(1);
  hudTime.textContent = fmtTime((now - startTime) / 1000);

  // mirror video into the processing canvas
  pctx.save();
  pctx.scale(-1, 1);
  pctx.drawImage(vid, -proc.width, 0, proc.width, proc.height);
  pctx.restore();

  // optional underwater color correction
  if (uwToggle.checked) {
    const img = pctx.getImageData(0, 0, proc.width, proc.height);
    correctUnderwater(img, redSlider.value / 10);
    pctx.putImageData(img, 0, 0);
  }

  // YOLO-style inference: top-20 predictions above the confidence threshold
  const threshold = confSlider.value / 100;
  let predictions = [];
  try {
    predictions = await model.detect(proc, 20, threshold);
  } catch (_) {
    /* swallow transient inference errors during frame drops */
  }

  // render detections
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const lines = [];
  let visible = 0;

  for (const p of predictions) {
    if (p.score < threshold) continue;
    visible++;
    const [x, y, w, h] = p.bbox;
    const color = colorFor(p.class);
    const label = `${p.class.toUpperCase()} ${(p.score * 100).toFixed(0)}%`;
    drawBox(octx, x, y, w, h, color, label);

    lines.push(
      `<div style="color:${color};">▸ ${p.class.padEnd(14, ' ')} ` +
      `${(p.score * 100).toFixed(1).padStart(5, ' ')}%  ` +
      `bbox(${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)})</div>`
    );
  }

  countEl.textContent = visible;
  detList.innerHTML = lines.length
    ? lines.join('')
    : '<div class="muted">// scanning… no objects above threshold</div>';

  requestAnimationFrame(loop);
}

// ---------- capture ----------
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
    a.download = `yolo-detect-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ---------- wire up controls ----------
btnStart.addEventListener('click', start);
btnStop .addEventListener('click', stop);
btnSnap .addEventListener('click', captureFrame);

confSlider.addEventListener('input', () => {
  confOut.textContent = (confSlider.value / 100).toFixed(2);
});
redSlider.addEventListener('input', () => {
  redOut.textContent = (redSlider.value / 10).toFixed(1) + 'x';
});
