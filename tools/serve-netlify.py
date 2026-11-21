#!/usr/bin/env python3
"""Local static server that applies the [[headers]] rules from netlify.toml (Harbor).

Plain `python3 -m http.server` ignores netlify.toml, so it can't show whether our CSP,
MIME types and cache headers work. This server reads netlify.toml and adds the same
headers, so the e2e test exercises the real production headers locally.

Usage (repo root):  python3 tools/serve-netlify.py [port]      default port 8080
Matching follows Netlify's rules closely enough for our paths: `*` is a wildcard,
every matching rule is applied, and later rules override earlier ones for the same name.
"""
import http.server, os, re, sys, tomllib
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "netlify.toml"), "rb") as fh:
    CONFIG = tomllib.load(fh)
RULES = [(re.compile("^" + re.escape(h["for"]).replace(r"\*", ".*") + "$"), h.get("values", {})) for h in CONFIG.get("headers", [])]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                      ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml"}

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        merged = {}
        for rx, values in RULES:
            if rx.match(path):
                merged.update(values)
        for k, v in merged.items():
            if k.lower() == "content-type":
                continue  # already sent by send_head; Netlify would override, our MIME map matches
            self.send_header(k, " ".join(str(v).split()))
        super().end_headers()

    def log_message(self, *args):
        if os.environ.get("VERBOSE"):
            super().log_message(*args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT))
    print(f"Serving {ROOT} with netlify.toml headers on http://127.0.0.1:{port}/")
    srv.serve_forever()
