---
name: document-scan-pipeline
description: The document-scanner computer-vision recipe in OpenCV.js: find the page, perspective-warp it flat, adaptive-threshold it to clean black and white. Use when building, tuning or testing page detection, corner ordering, warping or binarisation.
---

# Document scan pipeline (OpenCV.js)

1. **Downscale** for detection (long side ≈ 1000 px, `cv.resize`, `cv.INTER_AREA`), then scale the corners back up.
2. `cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)`. Images from canvas/ImageData are RGBA.
3. `cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0)`.
4. `cv.Canny(blur, edges, 75, 200)`, then optionally `cv.dilate` 3×3 to close gaps.
5. `cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)`.
6. Sort by `cv.contourArea`. For each large one: `peri = cv.arcLength(c, true)`, `cv.approxPolyDP(c, approx, 0.02*peri, true)`. Accept 4 points + `cv.isContourConvex` + area ≥ ~15–20% of the image.
7. **Fallback:** `cv.minAreaRect` of the largest contour (`cv.RotatedRect.points`), else the full image.
8. **Order corners** TL, TR, BR, BL: TL = min(x+y), BR = max(x+y), TR = min(y−x), BL = max(y−x).
9. Size: W = max(|TL−TR|, |BL−BR|), H = max(|TL−BL|, |TR−BR|).
10. `M = cv.getPerspectiveTransform(srcPts, dstPts)` with `cv.matFromArray(4,1,cv.CV_32FC2,[...])`. Then `cv.warpPerspective(src, warped, M, new cv.Size(W,H), cv.INTER_LINEAR, cv.BORDER_REPLICATE)`.
11. Clean: gray → `cv.adaptiveThreshold(g, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize(odd, ~21–31), C≈10–15)`. Optionally a light median blur to remove speckles.
12. Convert back to RGBA (`cv.COLOR_GRAY2RGBA`) for `ImageData`.

**Acceptance on a sample photo:** 4 corners within ~2% of the true page corners; the output is upright, rectangular, white background, black text; under ~1.5 s on a laptop.
