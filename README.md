# 🌊 YOLO — Live Underwater Detection

> Real-time underwater object detection in your browser. YOLO-style inference + adaptive color correction. No backend, no install, no data leaves your device.

**🔗 Live demo: [https://GithubFTC.github.io/YOLO/](https://GithubFTC.github.io/YOLO/)**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![No Backend](https://img.shields.io/badge/backend-none-success)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.20-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

Subsea Detect is a single-page web app that grabs your webcam (or a phone's rear camera), pipes each frame through a **YOLO-family single-shot detector** running on-device via TensorFlow.js, and overlays bounding boxes with sci-fi corner-bracket targeting graphics. An optional **underwater color-correction stage** sits in front of the model so the detector works on the blue-green cast that surface-trained networks normally choke on.

Everything runs client-side. Push to GitHub Pages and you have a live demo with zero infrastructure.

---

## ✨ Features

- 🎥 **Live camera inference** — rear camera preferred on mobile, front on desktop
- 🧠 **YOLO-style detector** — COCO-SSD (lite MobileNet v2 backbone, ~10 MB)
- 🌊 **Underwater color correction** — Gray World white-balance + red-channel boost, toggleable
- 🎛️ **Live tuning** — confidence threshold + red-boost sliders update in real time
- 📸 **Frame capture** — saves the corrected frame + detection overlay as PNG
- 🎨 **HUD overlay** — bearing, range, runtime, FPS, object count
- 🔒 **Privacy-first** — 100% on-device, no network calls after initial model load
- 📱 **Mobile-friendly** — responsive layout, touch-friendly controls

---

## 🚀 Quick start

### Run locally

You need any static file server — opening `index.html` directly via `file://` won't work because `getUserMedia` requires a secure context (https or localhost).

```bash
# clone
git clone https://github.com/GithubFTC/YOLO.git
cd YOLO

# any one of these works:
python3 -m http.server 8000
# or
npx serve .
# or
npx http-server -p 8000
```

Then open <http://localhost:8000>.

### Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → Source: `Deploy from a branch` → `main` / `/ (root)`.
3. Your demo is live at `https://GithubFTC.github.io/YOLO/`.

That's it. No build step, no bundler, no CI required.

---

## 📁 Project structure

```
YOLO/
├── index.html              # Entry point
├── src/
│   ├── main.js             # App logic, detection loop, UI wiring
│   └── styles.css          # All styles
├── .github/workflows/
│   └── pages.yml           # Optional GitHub Pages deploy workflow
├── LICENSE
├── README.md
└── .gitignore
```

---

## 🔬 How it works

### The pipeline

```
  ┌────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────┐   ┌─────────┐
  │ webcam │ → │ proc <canvas> │ → │  underwater  │ → │ COCO-SSD │ → │ overlay │
  └────────┘   └────────────┘   │   correction │   │ (YOLO)  │   │  draw   │
                                └──────────────┘   └─────────┘   └─────────┘
```

### Underwater color correction

Water absorbs longer wavelengths (red) within a few meters of depth, leaving the familiar blue-green cast. Detectors trained on surface imagery degrade fast in this regime — features they rely on disappear into a single channel.

The correction step does two things:

1. **Gray World white balance** — assumes the average scene color should be neutral and computes per-channel gains so each channel's mean equals the overall gray level.
2. **Red-channel boost** — an extra multiplicative gain on red (default `1.6x`, tunable via the slider) to recover what the water swallowed.

The blue channel gets a mild `0.85x` knock-down because over-corrected blue is what gives processed underwater footage that synthetic, "magenta haze" look.

```js
const rGain = (gray / rAvg) * redBoost;   // restore + boost
const gGain =  gray / gAvg;               // restore
const bGain = (gray / bAvg) * 0.85;       // restore - knock back
```

### Detection model

This ships with **COCO-SSD** (`lite_mobilenet_v2` backbone), a YOLO-family single-shot detector trained on the 80-class COCO dataset. It's not a real underwater model — it's the best off-the-shelf option for a one-click demo. To make this production-grade for marine work, see [Upgrading the model](#-upgrading-the-model) below.

---

## 🐠 Upgrading the model

COCO classes don't include _scallop_, _sea urchin_, or _ROV_. To detect actual marine objects, swap in a fine-tuned YOLOv8.

### Step 1 — fine-tune YOLOv8

In a Colab notebook (free tier):

```python
!pip install ultralytics

from ultralytics import YOLO

# Use a public underwater dataset (Roboflow has several free ones)
# https://universe.roboflow.com/ — search "underwater" or "aquarium"
model = YOLO('yolov8n.pt')
model.train(data='underwater.yaml', epochs=80, imgsz=640)
model.export(format='tfjs')
```

### Step 2 — drop in the weights

Copy the exported `model.json` + `*.bin` shard files into `public/yolo-underwater/`, then replace the loader in `src/main.js`:

```js
// before
model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

// after
const tfModel = await tf.loadGraphModel('./public/yolo-underwater/model.json');

async function detect(canvas) {
  const input = tf.tidy(() => {
    return tf.image
      .resizeBilinear(tf.browser.fromPixels(canvas), [640, 640])
      .div(255.0)
      .expandDims(0);
  });
  const output = await tfModel.executeAsync(input);
  input.dispose();
  return postprocess(output);   // NMS + bbox decode — see ultralytics docs
}
```

### Suggested datasets

| Dataset            | Classes                          | Size      | Link |
|--------------------|----------------------------------|-----------|------|
| URPC 2020          | sea cucumber, urchin, scallop, starfish | ~6 k img | [opendatalab.com](https://opendatalab.com/) |
| Brackish           | fish, crab, jellyfish, shrimp, starfish  | 14 k img | [Roboflow](https://public.roboflow.com/object-detection/brackish-underwater) |
| Aquarium           | fish, jellyfish, penguin, shark, etc.    | 638 img  | [Roboflow](https://public.roboflow.com/object-detection/aquarium) |
| TrashCan 1.0       | marine debris, ROV parts                 | 7 k img  | [conservancy.umn.edu](https://conservancy.umn.edu/handle/11299/214865) |

---

## 🛠️ Tech stack

- **HTML/CSS/vanilla JS** — no framework, no bundler
- **[TensorFlow.js](https://www.tensorflow.org/js) 4.20** — in-browser ML runtime
- **[COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) 2.2** — YOLO-style SSD detector
- **Canvas 2D** — image processing + overlay rendering
- **MediaDevices `getUserMedia`** — camera access

WebGPU backend is enabled by default on supported browsers (Chrome 113+, Edge 113+) — TF.js will pick it up automatically and you'll see 2-4× higher FPS than the WebGL backend.

---

## 🔧 Roadmap

- [ ] ByteTrack-lite temporal smoothing (kills box flicker)
- [ ] Custom YOLOv8n weights trained on a real underwater dataset
- [ ] Video file upload mode (not just live camera)
- [ ] Recording mode — save annotated video out
- [ ] Depth estimation overlay (MiDaS via TF.js)
- [ ] WebRTC streaming input for ROV control rooms
- [ ] Polarization-aware dehazing (academic; would need a 2-shot setup)

---

## 🤝 Contributing

PRs welcome. Keep dependencies minimal — the goal is "open `index.html`, it works."

```bash
git checkout -b feature/your-thing
# ...your changes...
git commit -m "feat: add your-thing"
git push origin feature/your-thing
```

---

## 📄 License

MIT — see [LICENSE](LICENSE). Do whatever you want, just don't blame me when it doesn't find Atlantis.

---

## 🙏 Credits

- COCO-SSD by the TensorFlow.js team
- Gray World assumption: Buchsbaum, _A spatial processor model for object colour perception_ (1980)
- Sci-fi corner brackets — every cyberpunk movie ever
