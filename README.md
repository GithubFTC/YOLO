# YOLO — Live Underwater Object Detection

A browser-based demo for real-time underwater object detection using TensorFlow.js. It uses your webcam or phone camera, applies optional underwater color correction, and draws detection boxes directly on the video feed.
**Live demo:** https://GithubFTC.github.io/YOLO/
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![No Backend](https://img.shields.io/badge/backend-none-success)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.20-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

## Overview

Subsea Detect is a single-page web app that runs object detection completely in the browser. It takes live camera input, processes each frame with a lightweight TensorFlow.js object detection model, and displays bounding boxes with a heads-up-display style overlay.
The app also includes an optional underwater color-correction step. This helps reduce the blue-green tint that often appears in underwater footage and can make objects easier for the model to detect.
Everything runs on the user’s device. There is no backend server, no installation, and no uploaded video data.

## Features

* Live webcam object detection
* Rear-camera support on mobile devices
* TensorFlow.js COCO-SSD model
* Optional underwater color correction
* Adjustable confidence threshold
* Adjustable red-channel boost
* Frame capture as PNG
* HUD-style overlay with FPS, runtime, and object count
* Fully client-side processing
* Mobile-friendly layout

## Quick Start

### Run Locally

Because camera access requires a secure context, opening `index.html` directly with `file://` may not work. Use a local server instead.

```bash
git clone https://github.com/GithubFTC/YOLO.git
cd YOLO
python3 -m http.server 8000
```

You can also use:

```bash
npx serve .
```

or:

```bash
npx http-server -p 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Set the source to **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`.
5. Save the settings.
   The site will be available at:

```text
https://GithubFTC.github.io/YOLO/
```

No build step or backend setup is required.

## Project Structure

```text
YOLO/
├── index.html
├── src/
│   ├── main.js
│   └── styles.css
├── .github/workflows/
│   └── pages.yml
├── LICENSE
├── README.md
└── .gitignore
```

## How It Works

The app follows a simple browser-based computer vision pipeline:

```text
Camera → Processing Canvas → Color Correction → Object Detection → Overlay
```

Each video frame is copied into a canvas. If underwater correction is enabled, the frame is adjusted before being passed into the detection model. The model returns detected objects, confidence scores, and bounding boxes, which are then drawn over the video feed.

## Underwater Color Correction

Underwater images often lose red tones because water absorbs longer wavelengths of light faster than shorter wavelengths. This usually leaves footage with a blue or green tint.
The correction step uses two basic adjustments:

1. **Gray World white balance** — The app estimates the average red, green, and blue values in the frame and adjusts them so the overall image looks more neutral.
2. **Red-channel boost** — Since red is often reduced underwater, the app applies an extra red boost. This value can be changed with the slider in the interface.
   The blue channel is slightly reduced to avoid making the corrected image look too artificial.

```js
const rGain = (gray / rAvg) * redBoost;
const gGain = gray / gAvg;
const bGain = (gray / bAvg) * 0.85;
```

## Detection Model

This project currently uses **COCO-SSD** with the `lite_mobilenet_v2` backbone. It is lightweight, runs well in the browser, and is good for a simple live demo.
However, COCO-SSD is trained on general everyday objects, not underwater objects. That means it may not reliably detect marine-specific objects such as scallops, sea urchins, ROV parts, or underwater debris.
For a stronger underwater detection system, the model should be replaced with a custom-trained YOLO model using an underwater dataset.

## Upgrading to a Custom YOLO Model

To detect real underwater objects, you can fine-tune a YOLOv8 model and export it to TensorFlow.js.

### Step 1: Train YOLOv8

Example using Google Colab:

```python
!pip install ultralytics
from ultralytics import YOLO
model = YOLO("yolov8n.pt")
model.train(data="underwater.yaml", epochs=80, imgsz=640)
model.export(format="tfjs")
```

### Step 2: Add the Exported Model

Copy the exported `model.json` and `.bin` shard files into:

```text
public/yolo-underwater/
```

Then replace the COCO-SSD loader in `src/main.js`.

```js
const tfModel = await tf.loadGraphModel("./public/yolo-underwater/model.json");
async function detect(canvas) {
  const input = tf.tidy(() => {
    return tf.image
      .resizeBilinear(tf.browser.fromPixels(canvas), [640, 640])
      .div(255.0)
      .expandDims(0);
  });
  const output = await tfModel.executeAsync(input);
  input.dispose();
  return postprocess(output);
}
```

You will also need to add post-processing for the YOLO output, including bounding box decoding and non-maximum suppression.

## Possible Underwater Datasets

| Dataset      | Example Classes                             |       Size | Link                                                                         |
| ------------ | ------------------------------------------- | ---------: | ---------------------------------------------------------------------------- |
| URPC 2020    | sea cucumber, sea urchin, scallop, starfish | ~6k images | [OpenDataLab](https://opendatalab.com/)                                      |
| Brackish     | fish, crab, jellyfish, shrimp, starfish     | 14k images | [Roboflow](https://public.roboflow.com/object-detection/brackish-underwater) |
| Aquarium     | fish, jellyfish, penguin, shark             | 638 images | [Roboflow](https://public.roboflow.com/object-detection/aquarium)            |
| TrashCan 1.0 | marine debris, ROV parts                    |  7k images | [University of Minnesota](https://conservancy.umn.edu/handle/11299/214865)   |

## Tech Stack

* HTML
* CSS
* Vanilla JavaScript
* TensorFlow.js
* COCO-SSD
* Canvas 2D
* MediaDevices `getUserMedia`
  The app is intentionally simple and lightweight. There is no framework, no bundler, and no backend server.

## Roadmap

* [ ] Add smoother tracking to reduce bounding box flicker
* [ ] Train and integrate custom underwater YOLOv8 weights
* [ ] Add video upload support
* [ ] Add annotated video recording
* [ ] Add depth-estimation overlay
* [ ] Add WebRTC input for remote camera feeds
* [ ] Improve underwater dehazing and color correction

## Contributing

Pull requests are welcome. Try to keep the project simple and easy to run.

```bash
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Credits

* TensorFlow.js team for COCO-SSD
* Buchsbaum’s Gray World color constancy model
* Open underwater datasets used as references for future model training
* Sci-fi HUD designs for overlay inspiration
