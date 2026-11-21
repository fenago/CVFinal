# 01 — OpenCV.js Functions for the Document Scanner

## 1. Getting and loading opencv.js

**Where to get it.** The *Using OpenCV.js* tutorial says you can get a prebuilt copy of `opencv.js` from the OpenCV release docs package (`opencv-{VERSION_NUMBER}-docs`). The docs site also hosts it at `https://docs.opencv.org/4.13.0/opencv.js`. Download it **once** and commit it under `/vendor/opencv/4.13.0/`. Don't hot-link the docs site from production (see [04-netlify-deployment.md](04-netlify-deployment.md)).

**Loading on a page.** These are the official patterns:

```html
<!-- synchronous -->
<script src="opencv.js" type="text/javascript"></script>

<!-- asynchronous, with a callback -->
<script async src="opencv.js" onload="onOpenCvReady();" type="text/javascript"></script>
```

**Knowing when it's ready.** Loading the script is not the same as being ready. The WebAssembly module still has to compile and start. The tutorial uses Emscripten's `Module.onRuntimeInitialized` hook, defined **before** the script loads:

```js
var Module = {
  // https://emscripten.org/docs/api_reference/module.html#Module.onRuntimeInitialized
  onRuntimeInitialized() {
    document.getElementById('status').innerHTML = 'OpenCV.js is ready.';
  }
};
```

Newer builds expose `cv` as a **Promise**. The docs say to unwrap it:

```js
cv = (cv instanceof Promise) ? await cv : cv;
```

**A robust "ready" helper** (our pattern; it handles both build styles). This works in the page and in a worker:

```js
async function cvReady() {
  let c = self.cv;
  if (c instanceof Promise) c = await c;            // promise-style build
  if (!c.Mat) {                                      // object-style build, runtime still initialising
    await new Promise(res => { c.onRuntimeInitialized = res; });
  }
  self.cv = c;
  return c;
}
```

> Tip: a quick sanity check once it's ready is `typeof cv.Mat === 'function'`, or `cv.getBuildInformation()` (prints the build config).

## 2. The functions the scanner needs

All signatures below are from the OpenCV 4.13.0 JS tutorials.

### I/O: `imread`, `imshow`, `matFromImageData` (main thread vs worker)

| Function | Signature | Notes |
|---|---|---|
| `cv.imread` | `cv.imread(imageSource)` | `imageSource` = a canvas or img element (or its id). Returns a Mat with channels in **RGBA** order. **Needs the DOM, so main thread only.** |
| `cv.imshow` | `cv.imshow(canvasSource, mat)` | Draws a Mat onto a canvas. 8U is shown as-is. 16U/32S are divided by 256. 32F is multiplied by 255. **Main thread only.** |
| `cv.matFromImageData` | `cv.matFromImageData(imgData)` | Builds a Mat from `ImageData`. Type is always `cv.CV_8UC4`, because canvas only supports 8-bit RGBA. **Use this in the worker.** |

From the docs:

```js
let ctx = canvas.getContext('2d');
let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
let src = cv.matFromImageData(imgData);
```

In the worker, swap `canvas` for an `OffscreenCanvas` that you draw the transferred `ImageBitmap` onto. To get pixels **out**, convert to RGBA first, then
`new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows)` → `putImageData` on an `OffscreenCanvas` → `convertToBlob({type:'image/png'})`. (This is our worker pattern, built from the documented pieces.)

### Color: `cvtColor`

`cv.cvtColor(src, dst, code, dstCn = 0)`. We use `cv.COLOR_RGBA2GRAY` (input is RGBA), and `cv.COLOR_GRAY2RGBA` to turn the result back into RGBA for `ImageData`.

### Smoothing: `GaussianBlur`

`cv.GaussianBlur(src, dst, ksize, sigmaX, sigmaY = 0, borderType = cv.BORDER_DEFAULT)`. For example `cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)`. This removes paper texture and sensor noise so Canny doesn't pick up false edges. Other options: `cv.medianBlur(src, dst, ksize)` and `cv.bilateralFilter(src, dst, d, sigmaColor, sigmaSpace)`, which keeps edges sharp but is slower.

### Edges: `Canny`

`cv.Canny(image, edges, threshold1, threshold2, apertureSize = 3, L2gradient = false)`. Hysteresis works like this: gradients above `threshold2` are sure edges, gradients below `threshold1` are dropped, and anything in between is kept only if it connects to a sure edge. Starting values: **75 / 200** (tune them). A `cv.dilate` with a 3×3 kernel after Canny helps close small gaps in the page outline. (That's our tip; dilate is documented in the Morphological Transformations tutorial.)

### Contours: `findContours`

`cv.findContours(image, contours, hierarchy, mode, method, offset = new cv.Point(0, 0))`

- `image`: 8-bit single-channel, treated as binary (the Canny output).
- `contours`: a `cv.MatVector` (output). `hierarchy`: a `cv.Mat` (output).
- `mode`: for the outer page border, `cv.RETR_EXTERNAL` is enough (`cv.RETR_LIST` also works).
- `method`: `cv.CHAIN_APPROX_SIMPLE` compresses straight runs down to their endpoints. It's cheaper.

For debugging there's also `cv.drawContours(image, contours, contourIdx, color, thickness = 1, …)`. A negative `contourIdx` draws all contours.

### Contour features: `contourArea`, `arcLength`, `approxPolyDP`

| Function | Signature | Use |
|---|---|---|
| `cv.contourArea` | `(contour, oriented = false)` | Sort contours, largest first. Reject tiny ones (for example under 20% of the image area). |
| `cv.arcLength` | `(curve, closed)` | Perimeter. Used to scale epsilon. |
| `cv.approxPolyDP` | `(curve, approxCurve, epsilon, closed)` | Simplifies a contour to a polygon. `epsilon` = max distance from the original curve. Use `0.02 * arcLength(c, true)`. A page gives **4 vertices**. |
| `cv.isContourConvex` | `(cnt)` | Reject twisted or concave quads. |
| `cv.minAreaRect` | `(points)` | Fallback: a rotated rectangle around the largest contour when no clean 4-gon is found. |
| `cv.convexHull` | `(points, hull, clockwise = false, returnPoints = true)` | Optional clean-up before approximating. |

`approxCurve` is a Mat of type `CV_32SC2`. Read its four points from `approx.data32S` as `[x0,y0,x1,y1,…]`. The data accessors are `data` (Uint8), `data32S` (Int32), `data32F` (Float32), `data64F` (Float64).

### Perspective: `getPerspectiveTransform` + `warpPerspective`

- `cv.getPerspectiveTransform(src, dst)`: `src` and `dst` are 4-point Mats (build them with `cv.matFromArray(4, 1, cv.CV_32FC2, [x0,y0, …])`). Returns a 3×3 `CV_64FC1` matrix `M`.
- `cv.warpPerspective(src, dst, M, dsize, flags = cv.INTER_LINEAR, borderMode = cv.BORDER_CONSTANT, borderValue = new cv.Scalar())`.

**Corner order matters.** `src` and `dst` points must match one-to-one. Order the four detected corners as **top-left, top-right, bottom-right, bottom-left**:
- top-left = smallest `x+y`, bottom-right = largest `x+y`
- top-right = smallest `y−x`, bottom-left = largest `y−x`

**Output size.** Width = max(dist(TL,TR), dist(BL,BR)). Height = max(dist(TL,BL), dist(TR,BR)). `dst` = `[0,0, W-1,0, W-1,H-1, 0,H-1]`.

`cv.resize(src, dst, dsize, fx = 0, fy = 0, interpolation = cv.INTER_LINEAR)` is used to downscale before detection. `cv.INTER_AREA` is best for shrinking.

### Clean-up: `adaptiveThreshold` (and `threshold`)

`cv.adaptiveThreshold(src, dst, maxValue, adaptiveMethod, thresholdType, blockSize, C)`

- `src`: 8-bit single channel (the gray warped page).
- `adaptiveMethod`: `cv.ADAPTIVE_THRESH_MEAN_C` or `cv.ADAPTIVE_THRESH_GAUSSIAN_C` (Gaussian usually looks cleaner on text).
- `thresholdType`: `cv.THRESH_BINARY` (black text on white).
- `blockSize`: odd neighbourhood size (3, 5, 7, …). Larger values handle uneven lighting and shadows better. Try **15–31** depending on resolution.
- `C`: constant subtracted from the local mean. Start around **10**. Raise it for a whiter background.

Why adaptive and not global? A global `cv.threshold(src, dst, thresh, maxval, type)` (even with `cv.THRESH_OTSU`) picks **one** threshold for the whole page, so a shadow across a receipt turns into a black blob. Adaptive thresholding computes a threshold for each neighbourhood. Offer a "Grayscale" or "Color" mode in settings too, since some users want a photo-like scan.

## 3. Reference implementation sketch (worker side)

```js
function scanPage(rgba /* cv.Mat CV_8UC4 */, opts) {
  const mats = [];                         // everything we allocate goes here
  const track = m => (mats.push(m), m);
  try {
    const gray  = track(new cv.Mat());
    const blur  = track(new cv.Mat());
    const edges = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 75, 200);

    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let quad = null, bestArea = 0;
    const minArea = 0.2 * rgba.rows * rgba.cols;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);           // .get() returns a NEW Mat → must delete
      try {
        const area = cv.contourArea(c);
        if (area < minArea || area <= bestArea) continue;
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          quad = Array.from(approx.data32S); bestArea = area;
        }
        approx.delete();
      } finally { c.delete(); }
    }
    if (!quad) quad = [0,0, rgba.cols-1,0, rgba.cols-1,rgba.rows-1, 0,rgba.rows-1];

    const [tl, tr, br, bl] = orderCorners(quad);            // sum/diff rule above
    const W = Math.round(Math.max(dist(tl,tr), dist(bl,br)));
    const H = Math.round(Math.max(dist(tl,bl), dist(tr,br)));
    const srcPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, [...tl, ...tr, ...br, ...bl]));
    const dstPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0,0, W-1,0, W-1,H-1, 0,H-1]));
    const M = track(cv.getPerspectiveTransform(srcPts, dstPts));
    const warped = track(new cv.Mat());
    cv.warpPerspective(rgba, warped, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    const wgray = track(new cv.Mat());
    const bw = track(new cv.Mat());
    cv.cvtColor(warped, wgray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(wgray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY,
                         opts.blockSize ?? 21, opts.C ?? 10);
    const out = new cv.Mat();               // caller owns & deletes
    cv.cvtColor(bw, out, cv.COLOR_GRAY2RGBA);
    return { out, corners: [tl, tr, br, bl] };
  } finally {
    mats.forEach(m => m.delete());
  }
}
```

## 4. Webcam capture

From *Getting Started with Videos*:

```js
navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(stream => { video.srcObject = stream; video.play(); });
let src = new cv.Mat(height, width, cv.CV_8UC4);
let cap = new cv.VideoCapture(video);   // reads from a <video> → main thread only
cap.read(src);
```

The docs remind you to delete `src`/`dst` when you stop. For our app, don't call `VideoCapture` on the main thread for every frame. Do this instead: on "Capture", draw the video to a canvas, call `createImageBitmap(canvas)`, and transfer the bitmap to the worker. For a live corner overlay, send downscaled frames at about 5–10 fps and skip a frame if the worker is still busy. Use `{ video: { facingMode: 'environment' } }` to get the rear camera on phones. `getUserMedia` needs HTTPS, which Netlify provides.

## Sources

- Using OpenCV.js — <https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html>
- Getting Started with Images — <https://docs.opencv.org/4.13.0/df/d24/tutorial_js_image_display.html>
- Basic Operations on Images — <https://docs.opencv.org/4.13.0/de/d06/tutorial_js_basic_ops.html>
- Changing Colorspaces — <https://docs.opencv.org/4.13.0/db/d64/tutorial_js_colorspaces.html>
- Smoothing Images — <https://docs.opencv.org/4.13.0/dd/d6a/tutorial_js_filtering.html>
- Canny Edge Detection — <https://docs.opencv.org/4.13.0/d7/de1/tutorial_js_canny.html>
- Image Thresholding — <https://docs.opencv.org/4.13.0/d7/dd0/tutorial_js_thresholding.html>
- Contours: Getting Started — <https://docs.opencv.org/4.13.0/d5/daa/tutorial_js_contours_begin.html>
- Contour Features — <https://docs.opencv.org/4.13.0/dc/dcf/tutorial_js_contour_features.html>
- Geometric Transformations — <https://docs.opencv.org/4.13.0/dd/d52/tutorial_js_geometric_transformations.html>
- Getting Started with Videos — <https://docs.opencv.org/4.13.0/dd/d00/tutorial_js_video_display.html>
