#!/usr/bin/env bash
# Verify headers on a deployed (or local) site. Usage: ./verify-headers.sh https://example.netlify.app
BASE=${1:-http://localhost:8080}
for p in / /vendor/opencv/4.12.0/opencv.js /scanner.worker.js; do
  echo "== $p"; curl -sI "$BASE$p" | grep -iE '^(HTTP|content-type|cache-control|content-encoding|content-length)'
done
