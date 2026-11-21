# Netlify file-based configuration and headers

Sources: https://docs.netlify.com/build/configure-builds/file-based-configuration/ · https://docs.netlify.com/manage/routing/headers/ · https://docs.netlify.com/build/caching/caching-overview/

- `netlify.toml` is "normally stored in the root of your site repository". `[build]`: `base` (base directory), `publish` (publish directory), `command` (build command).
- File config overrides UI settings for the same property.
- Headers: `[[headers]] for = "/*"` + `[headers.values]`. Multi-value headers use multi-line strings. In `_headers`, a repeated name gets concatenated.
- Paths: `*` wildcard; `:placeholder` matches one segment.
- Defaults: `Cache-Control: public, max-age=0, must-revalidate`, `Netlify-CDN-Cache-Control: public, s-maxage=31536000, must-revalidate`.
- Per-file size: staff recommend "no more than 10MB". Pre-compressed files are not supported (double compression).
