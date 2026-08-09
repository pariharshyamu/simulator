#!/usr/bin/env python3
"""Serve the repository the way GitHub Pages will: under /<name>/, not /.

The whole point is to catch the class of bug that only appears once a site has
a path prefix — a root-absolute URL, a service worker with the wrong scope, a
manifest whose start_url points at the origin root. Those all work perfectly on
localhost:8000 and 404 the moment they are deployed.

    python3 tools/serve-subpath.py                 http://localhost:8000/simulator/
    python3 tools/serve-subpath.py --port 9091 --prefix simulator
"""
import argparse, functools, http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def make_handler(prefix):
    base = '/' + prefix.strip('/') + '/'

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def translate_path(self, path):
            if path == base.rstrip('/'):
                path = base
            if not path.startswith(base):
                return os.path.join(ROOT, '__no_such_path__')
            return super().translate_path('/' + path[len(base):])

        def send_head(self):
            if self.path.rstrip('/') == base.rstrip('/') and not self.path.endswith('/'):
                self.send_response(301)
                self.send_header('Location', base)
                self.end_headers()
                return None
            return super().send_head()

        def end_headers(self):
            # GitHub Pages does not send COOP/COEP. Neither do we, so that the
            # test sees exactly the isolation the real deployment will have.
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, fmt, *args):
            if '--quiet' not in sys.argv:
                sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))

    H.extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    H.extensions_map.update({
        '.mjs': 'text/javascript', '.js': 'text/javascript',
        '.webmanifest': 'application/manifest+json', '.json': 'application/json',
        '.wasm': 'application/wasm',
    })
    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--prefix', default='simulator')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', a.port), make_handler(a.prefix)) as srv:
        print(f'http://localhost:{a.port}/{a.prefix.strip("/")}/')
        srv.serve_forever()


if __name__ == '__main__':
    main()
