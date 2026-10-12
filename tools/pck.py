"""Godot 4 PCK reader (standalone .pck or embedded in an .exe).

  python pck.py info <file>
  python pck.py list <file> [regex]
  python pck.py extract <file> <outdir> <regex>
"""
import os, re, struct, sys
from collections import Counter

MAGIC = b"GDPC"

def find_pck_start(f, size):
    f.seek(0)
    if f.read(4) == MAGIC:
        return 0
    # embedded: [pck][u64 pck_size][GDPC] at EOF
    f.seek(size - 4)
    if f.read(4) == MAGIC:
        f.seek(size - 12)
        (psize,) = struct.unpack("<Q", f.read(8))
        start = size - 12 - psize
        f.seek(start)
        if f.read(4) == MAGIC:
            return start
    # PE section named "pck"
    f.seek(0x3C)
    (pe,) = struct.unpack("<I", f.read(4))
    f.seek(pe + 6)
    (nsec,) = struct.unpack("<H", f.read(2))
    f.seek(pe + 20)
    (optsz,) = struct.unpack("<H", f.read(2))
    f.seek(pe + 24 + optsz)
    for _ in range(nsec):
        sec = f.read(40)
        if sec[:8].rstrip(b"\0") == b"pck":
            (raw,) = struct.unpack("<I", sec[20:24])
            f.seek(raw)
            if f.read(4) == MAGIC:
                return raw
    raise SystemExit("no PCK found")

def read_dir(path):
    size = os.path.getsize(path)
    f = open(path, "rb")
    start = find_pck_start(f, size)
    f.seek(start + 4)
    fmt, vmaj, vmin, vpat = struct.unpack("<4I", f.read(16))
    flags, = struct.unpack("<I", f.read(4))
    file_base, = struct.unpack("<Q", f.read(8))
    dir_off = None
    if fmt >= 3:
        dir_off, = struct.unpack("<Q", f.read(8))
    f.read(16 * 4)
    rel = bool(flags & 2)
    if rel:
        file_base += start
    if dir_off is not None:
        f.seek(dir_off + (start if rel else 0))
    hdr = dict(start=start, fmt=fmt, godot=f"{vmaj}.{vmin}.{vpat}", flags=flags,
               file_base=file_base, dir_encrypted=bool(flags & 1))
    if flags & 1:
        return f, hdr, []
    n, = struct.unpack("<I", f.read(4))
    entries = []
    for _ in range(n):
        plen, = struct.unpack("<I", f.read(4))
        p = f.read(plen).rstrip(b"\0").decode("utf-8", "replace")
        off, sz = struct.unpack("<QQ", f.read(16))
        f.read(16)
        eflags, = struct.unpack("<I", f.read(4))
        entries.append((p, file_base + off, sz, eflags))
    return f, hdr, entries

def main():
    cmd, path = sys.argv[1], sys.argv[2]
    f, hdr, entries = read_dir(path)
    if cmd == "info":
        print(hdr, "files:", len(entries))
        print("encrypted files:", sum(1 for e in entries if e[3] & 1))
        c, s = Counter(), Counter()
        for p, _, sz, _ in entries:
            ext = os.path.splitext(p)[1].lower()
            c[ext] += 1
            s[ext] += sz
        for ext, n in c.most_common(40):
            print(f"  {ext or '(none)':12} {n:7}  {s[ext] / 1e6:10.1f} MB")
    elif cmd == "list":
        rx = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
        for p, _, sz, fl in entries:
            if not rx or rx.search(p):
                print(f"{sz:10} {'E' if fl & 1 else ' '} {p}")
    elif cmd == "extract":
        out, rx = sys.argv[3], re.compile(sys.argv[4])
        out = "\\\\?\\" + os.path.abspath(out)  # long-path prefix (Windows MAX_PATH)
        n = 0
        for p, off, sz, fl in entries:
            if not rx.search(p) or fl & 1:
                continue
            rel = p.replace("res://", "").replace("user://", "_user/").lstrip("/")
            dst = os.path.normpath(os.path.join(out, rel))
            if not dst.startswith(os.path.normpath(out)):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            f.seek(off)
            with open(dst, "wb") as o:
                o.write(f.read(sz))
            n += 1
        print("extracted", n)

main()
