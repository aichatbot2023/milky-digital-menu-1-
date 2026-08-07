"""Statički server za `public/`, sa CORS zaglavljem.

Postoji zbog merenja. Vite razvojni server NAMERNO odbija da posluži fajlove
iz `public/` kroz dinamički `import` — poruka je izričita: ti fajlovi se u
build-u kopiraju kakvi jesu i ne prolaze kroz transformacije. U proizvodnji
to radi, u razvoju ne, pa se model i wasm runtime za merenje serviraju
odavde, sa zasebnog porta.

    python3 tools/static-cors-server.py [port]
"""
import functools
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5200


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, *a):
        pass  # tišina; merenje ima svoj ispis


http.server.ThreadingHTTPServer(
    ("127.0.0.1", PORT), functools.partial(Handler, directory=sys.argv[2] if len(sys.argv) > 2 else "public")
).serve_forever()
