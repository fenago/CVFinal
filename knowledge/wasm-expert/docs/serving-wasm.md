# Serving opencv.js / Wasm on a static host

Sources: https://docs.netlify.com/manage/routing/headers/ · https://docs.netlify.com/build/caching/caching-overview/ · https://answers.netlify.com/t/what-is-the-maximum-allowed-object-size/145182 · https://answers.netlify.com/t/netlify-corrupting-served-data-files-by-compressing-already-compressed-files/69428

- Our `opencv.js` is 10,872,779 bytes raw and ~3.5 MB gzip (measured). Netlify staff: "the recommended size for uploading to deploys is no more than 10MB" (a recommendation, not a hard limit).
- Don't upload pre-compressed `.br`/`.gz`. Netlify compresses again → `CompileError: … expected magic word 00 61 73 6d`.
- Netlify default `Cache-Control: public, max-age=0, must-revalidate`. Versioned vendor path → `public, max-age=31536000, immutable`.
- If a split build is ever used: `Content-Type: application/wasm` for `*.wasm`.
