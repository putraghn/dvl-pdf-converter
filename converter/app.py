"""
PDF -> DOCX converter service (pdf2docx).

Runs on the internal Docker network only; the Node API is its sole client.
Each conversion happens in a child process that is killed when it exceeds
CONVERT_TIMEOUT_SEC, so a pathological PDF cannot hold a CPU forever.

  GET  /health   -> 200 {"status":"ok"}
  POST /convert  -> body: raw PDF bytes, answer: the .docx bytes
                    errors: JSON {"error": "..."} with 400/413/422/503/504
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "5000"))
MAX_BYTES = int(float(os.environ.get("MAX_FILE_MB", "50")) * 1024 * 1024)
TIMEOUT = float(os.environ.get("CONVERT_TIMEOUT_SEC", "120"))
MAX_CONCURRENT = max(1, int(os.environ.get("MAX_CONCURRENT", "1")))
QUEUE_WAIT = float(os.environ.get("QUEUE_WAIT_SEC", "5"))
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

slots = threading.BoundedSemaphore(MAX_CONCURRENT)
HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(BaseHTTPRequestHandler):
    server_version = "converter"
    sys_version = ""

    def log_message(self, fmt, *args):  # metadata only, never file names
        sys.stderr.write("%s %s\n" % (self.command, fmt % args))

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"status": "ok"})
        self._json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/convert":
            return self._json(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self._json(400, {"error": "Content-Length is required."})
        if length <= 0:
            return self._json(400, {"error": "Empty body."})
        if length > MAX_BYTES:
            return self._json(413, {"error": "File too large."})
        data = self.rfile.read(length)
        if data[:1024].find(b"%PDF-") == -1:
            return self._json(400, {"error": "Not a PDF file."})

        if not slots.acquire(timeout=QUEUE_WAIT):
            return self._json(503, {"error": "The converter is busy. Try again in a moment."})
        try:
            self._convert(data)
        finally:
            slots.release()

    def _convert(self, data):
        with tempfile.TemporaryDirectory(prefix="p2d-") as tmp:
            src = os.path.join(tmp, f"{uuid.uuid4()}.pdf")
            dst = os.path.join(tmp, f"{uuid.uuid4()}.docx")
            with open(src, "wb") as f:
                f.write(data)
            try:
                proc = subprocess.run(
                    [sys.executable, os.path.join(HERE, "convert.py"), src, dst],
                    capture_output=True,
                    timeout=TIMEOUT,
                    cwd=tmp,
                )
            except subprocess.TimeoutExpired:
                return self._json(504, {"error": "Conversion took too long and was stopped."})
            if proc.returncode != 0 or not os.path.exists(dst):
                sys.stderr.write(proc.stderr.decode("utf-8", "replace")[-500:] + "\n")
                return self._json(422, {"error": "This PDF could not be converted to Word."})
            with open(dst, "rb") as f:
                out = f.read()
        self.send_response(200)
        self.send_header("Content-Type", DOCX_TYPE)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True
    print(f"converter listening on :{PORT} (timeout {TIMEOUT}s, concurrent {MAX_CONCURRENT})", flush=True)
    srv.serve_forever()