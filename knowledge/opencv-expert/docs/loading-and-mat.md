# Loading opencv.js and managing cv.Mat

Sources: https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html · https://docs.opencv.org/4.13.0/de/d06/tutorial_js_basic_ops.html · https://docs.opencv.org/4.13.0/df/d24/tutorial_js_image_display.html

**Loading**
- `<script async src="opencv.js" onload="onOpenCvReady();" type="text/javascript"></script>`
- Readiness hook: `var Module = { onRuntimeInitialized() { ... } };`
- Newer builds: "The promise-typed `cv` object should be unwrap with `await` operator": `cv = (cv instanceof Promise) ? await cv : cv;`
- Our vendored build: OpenCV **4.12.0**, `SINGLE_FILE=1`, `USE_PTHREADS=0` (checked with `cv.getBuildInformation()`). The API used here is identical to the 4.13.0 tutorials.

**I/O**
- `cv.imread(imageSource)`: canvas/img element or id. Returns an RGBA Mat. Needs the DOM.
- `cv.imshow(canvasSource, mat)`. Needs the DOM.
- `cv.matFromImageData(imgData)`: type is always `cv.CV_8UC4`, "because canvas only support 8-bit RGBA image with continuous storage". **Use this in workers.**

**Mat**
- Constructors: `new cv.Mat()`, `new cv.Mat(rows, cols, type)`, `new cv.Mat(rows, cols, type, new cv.Scalar(...))`, `cv.Mat.zeros/ones/eye`, `cv.matFromArray(rows, cols, type, array)`.
- Copy: `src.clone()`, `src.copyTo(dst, mask)`.
- Data views: `data` (Uint8), `data8S`, `data16U`, `data16S`, `data32S` (Int32), `data32F`, `data64F`.
- MatVector: `new cv.MatVector()`, `push_back`, `get(i)`, `size()`.
- **"You have to call delete method of cv.Mat to free memory allocated in Emscripten's heap."** Also delete MatVectors and the Mats you get from `get(i)`.
