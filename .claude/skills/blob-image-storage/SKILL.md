---
name: blob-image-storage
description: Store and display images as Blobs in the browser. Use when encoding scan results (PNG/JPEG), saving originals/results to IndexedDB, building thumbnails, showing them with object URLs, or estimating storage use.
---

# Blob image storage

- Encode in the worker: `await new OffscreenCanvas(w,h)...convertToBlob({type:'image/png'})` (B/W), or `'image/jpeg', quality:0.85` (originals/photos).
- IndexedDB stores Blobs natively (structured clone). **Never store base64 data URLs** (about 33% bigger and slow).
- Record shape: `{id, name, createdAt, original: Blob, result: Blob, thumb: Blob, width, height, corners}`.
- Display: `url = URL.createObjectURL(blob)` → `<img src>`. Call `URL.revokeObjectURL(url)` when the element is removed or re-rendered.
- Quota: `navigator.storage.estimate()` → `{usage, quota}`. Call `navigator.storage.persist()` to avoid eviction. Catch `QuotaExceededError`.
- Downloads: `<a download="name.png" href=objectURL>`.
