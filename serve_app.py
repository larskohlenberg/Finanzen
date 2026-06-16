#!/usr/bin/env python3
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent / "app"
HOST = "127.0.0.1"
# Port optional per Argument (Standard 8000). Die No-Cache-Header (NoCacheHandler)
# verhindern, dass der Browser ES-Module nach einer Code-Aenderung stale aus dem
# Cache laedt — sonst bricht ein statischer Import auf neu hinzugefuegte Exporte.
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    handler = partial(NoCacheHandler, directory=str(APP_DIR))
    server = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Serving {APP_DIR}")
    print(f"Open http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
