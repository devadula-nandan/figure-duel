"""Figure Duel: serves the UI and runs the original game's rule engine behind it.

    python play.py            ->  http://localhost:8765

The rules are not re-implemented: every legal move, spin, effect and AI move comes from libTFG.so, read at start-up
straight out of the original APK in this folder and executed under an ARM emulator (tools/tfg.py).
Needs:  pip install unicorn keystone-engine
"""
import glob, http.server, json, multiprocessing, os, queue, sys, threading, webbrowser, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT, ENGINES = 8765, 4


def engine_worker(conn, lib):
    """One emulated engine per process (separate processes run in parallel; threads in one process do not)."""
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from tfg import TFG, EngineAbort
    eng = TFG(lib)
    while True:
        text = conn.recv()
        try:
            conn.send(eng.cmd(text))
        except EngineAbort as e:  # an aborted instance may be left inconsistent: start a fresh one
            conn.send(json.dumps({"error": str(e)}))
            eng = TFG(lib)


class Handler(http.server.SimpleHTTPRequestHandler):
    pool = None
    lib = None

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(ROOT, "web"), **kw)

    def do_POST(self):
        if self.path != "/api/cmd":
            return self.send_error(404)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        conn = self.pool.get()  # the engine is stateless per command, so any free instance will do
        try:
            conn.send(body.replace("\n", "").replace("\r", ""))
            data = conn.recv().encode("utf-8")
        finally:
            self.pool.put(conn)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/libTFG.so" and Handler.lib:      # read from the APK at start-up, never written into web/
            self.send_response(200); self.send_header("Content-Type", "application/octet-stream"); self.send_header("Content-Length", str(len(Handler.lib)))
            self.end_headers(); self.wfile.write(Handler.lib); return
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # the page may be served from elsewhere (for example a static host) while the engine runs on this machine
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apk = next(iter(args or glob.glob(os.path.join(ROOT, "*.apk"))), None)
    if not apk:
        sys.exit("Put the original APK next to play.py (or pass its path): the rule engine is loaded from it.")
    lib = zipfile.ZipFile(apk).read("lib/armeabi-v7a/libTFG.so")
    Handler.pool = queue.Queue()
    Handler.lib = lib
    for _ in range(ENGINES):
        ours, theirs = multiprocessing.Pipe()
        multiprocessing.Process(target=engine_worker, args=(theirs, lib), daemon=True).start()
        Handler.pool.put(ours)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("Figure Duel: http://localhost:%d   (rule engine from %s)" % (PORT, os.path.basename(apk)))
    if "--no-browser" not in sys.argv:
        threading.Timer(1.5, webbrowser.open, ["http://localhost:%d" % PORT]).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
