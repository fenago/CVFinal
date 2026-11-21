# Browser APIs for the shell

Sources: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia · https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static · https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers · https://docs.opencv.org/4.13.0/dd/d00/tutorial_js_video_display.html

- `getUserMedia` "is available only in secure contexts (HTTPS)". On HTTP, `navigator.mediaDevices` is `undefined`. Rear camera: `{ video: { facingMode: { exact: "environment" } } }` (or non-exact as a preference).
- Errors: `NotAllowedError` (denied / insecure), `NotFoundError` (no camera), `NotReadableError` (hardware busy), `OverconstrainedError` (constraints impossible). Stop tracks (`track.stop()`) when done.
- OpenCV docs webcam pattern: `video.srcObject = stream; video.play();`. We capture one frame to a canvas and transfer an `ImageBitmap` to the worker instead of using `cv.VideoCapture`.
- `URL.createObjectURL(blob)` → pair it with `URL.revokeObjectURL(url)`.
- Workers: `postMessage` + transfer list for zero-copy.
- `localhost` counts as a secure context, so the camera works when testing locally.
