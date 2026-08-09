#!/usr/bin/env python3
"""Tiny static server for the MAHAGENCO Local RAG Bench.

Serves this folder on http://localhost:8181 with the two headers ONNX Runtime
needs to use multiple CPU threads (cross-origin isolation).  Nothing is sent
anywhere: this only makes the browser willing to load local files as modules.
"""
import http.server, socketserver, os, sys, webbrowser, threading

PORT = int(os.environ.get("PORT", "8181"))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # cross-origin isolation -> SharedArrayBuffer -> multi-threaded WASM
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "public, max-age=31536000")
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        if " 200 " in msg or " 206 " in msg:
            return          # keep the console quiet during a lecture
        sys.stderr.write("%s\n" % msg)


Handler.extensions_map.update({
    ".js": "text/javascript", ".mjs": "text/javascript",
    ".json": "application/json", ".wasm": "application/wasm",
    ".onnx": "application/octet-stream", ".i8": "application/octet-stream",
    ".f32": "application/octet-stream",
})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/"
    print("=" * 62)
    print("  MAHAGENCO — Local RAG Bench")
    print("  serving:", ROOT)
    print("  open   :", url)
    print("  stop   : Ctrl-C")
    print("=" * 62)
    threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    try:
        with Server(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    except OSError as e:
        print(f"\nCould not bind port {PORT}: {e}")
        print(f"Try:  PORT=8282 python serve.py")
