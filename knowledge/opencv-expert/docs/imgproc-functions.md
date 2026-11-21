# Image-processing functions used by the scanner

Sources: Colorspaces https://docs.opencv.org/4.13.0/db/d64/tutorial_js_colorspaces.html · Smoothing https://docs.opencv.org/4.13.0/dd/d6a/tutorial_js_filtering.html · Canny https://docs.opencv.org/4.13.0/d7/de1/tutorial_js_canny.html · Contours https://docs.opencv.org/4.13.0/d5/daa/tutorial_js_contours_begin.html · Contour features https://docs.opencv.org/4.13.0/dc/dcf/tutorial_js_contour_features.html · Geometric transforms https://docs.opencv.org/4.13.0/dd/d52/tutorial_js_geometric_transformations.html · Thresholding https://docs.opencv.org/4.13.0/d7/dd0/tutorial_js_thresholding.html

| Function | Signature (from the docs) | Notes |
|---|---|---|
| cvtColor | `cv.cvtColor(src, dst, code, dstCn = 0)` | `cv.COLOR_RGBA2GRAY`, `cv.COLOR_GRAY2RGBA` |
| GaussianBlur | `cv.GaussianBlur(src, dst, ksize, sigmaX, sigmaY = 0, borderType = cv.BORDER_DEFAULT)` | `new cv.Size(5,5)` |
| medianBlur | `cv.medianBlur(src, dst, ksize)` | despeckle after thresholding |
| Canny | `cv.Canny(image, edges, threshold1, threshold2, apertureSize = 3, L2gradient = false)` | Hysteresis: above maxVal = sure edge, below minVal = discarded, in between kept if connected to a sure edge |
| findContours | `cv.findContours(image, contours, hierarchy, mode, method, offset)` | 8-bit single channel, treated as binary. `cv.RETR_EXTERNAL`, `cv.CHAIN_APPROX_SIMPLE` |
| contourArea | `cv.contourArea(contour, oriented = false)` | |
| arcLength | `cv.arcLength(curve, closed)` | |
| approxPolyDP | `cv.approxPolyDP(curve, approxCurve, epsilon, closed)` | epsilon = max distance between the original curve and its approximation |
| isContourConvex | `cv.isContourConvex(cnt)` | |
| minAreaRect | `cv.minAreaRect(points)` | fallback rotated box |
| getPerspectiveTransform | `cv.getPerspectiveTransform(src, dst)` | 4 point pairs → 3×3 `CV_64FC1` |
| warpPerspective | `cv.warpPerspective(src, dst, M, dsize, flags = cv.INTER_LINEAR, borderMode = cv.BORDER_CONSTANT, borderValue = new cv.Scalar())` | |
| resize | `cv.resize(src, dst, dsize, fx = 0, fy = 0, interpolation = cv.INTER_LINEAR)` | use `cv.INTER_AREA` when shrinking |
| threshold | `cv.threshold(src, dst, thresh, maxval, type)` | add `cv.THRESH_OTSU` for automatic thresholding |
| adaptiveThreshold | `cv.adaptiveThreshold(src, dst, maxValue, adaptiveMethod, thresholdType, blockSize, C)` | `cv.ADAPTIVE_THRESH_GAUSSIAN_C` / `MEAN_C`. blockSize is odd (3, 5, 7…). C is "constant subtracted from the mean or weighted mean" |
