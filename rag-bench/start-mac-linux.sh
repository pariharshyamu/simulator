#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
PY=$(command -v python3 || command -v python) || {
  echo "  Python was not found. Serve this folder with any static web server."; exit 1; }
if [ ! -f "vendor/transformers.min.js" ]; then
  echo
  echo "  First run: fetching the runtime and embedding model, about 85 MB."
  echo "  Once only. After this the bench works with the network unplugged."
  echo
  "$PY" get-models.py vendor
fi
if [ ! -f "models/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx" ]; then
  "$PY" get-models.py embedder
fi
echo
echo "  MAHAGENCO - Local RAG Bench — Ctrl-C to stop."
echo
exec "$PY" serve.py
