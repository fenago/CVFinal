---
name: netlify-static-deploy
description: Deploy a static site to Netlify. Use when writing netlify.toml or _headers, choosing the publish folder, setting cache/MIME/security headers, deploying (Git, CLI, drag-and-drop) or verifying the live site.
---

# Netlify static deploy

```toml
[build]
  publish = "."      # folder containing index.html
  # no build command: plain static files

[[headers]]
  for = "/*.wasm"
  [headers.values]
    Content-Type = "application/wasm"
[[headers]]
  for = "/vendor/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "no-cache"
```
- Netlify default: `Cache-Control: public, max-age=0, must-revalidate`. Duplicate matching headers get concatenated, so don't overlap `Cache-Control` rules.
- Deploy: (1) connect the GitHub repo, with no build command and the publish dir; (2) `npx netlify-cli deploy --dir=. --prod`; (3) drag-and-drop the folder at app.netlify.com/drop.
- HTTPS is automatic. Webcam (`getUserMedia`) requires it.
- Every deploy-preview URL is a separate origin, so it has its own empty IndexedDB.
- Verify: `curl -sI https://<site>/vendor/opencv/4.12.0/opencv.js`.
