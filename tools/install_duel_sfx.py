"""Copy every WAV from The Sounds Resource Pokémon Duel packs into web/sfx/.

Sources (unzipped under tools/sfx-src/):
  duels/     — Duels pack (107 items)
  common/    — Common pack (30 items)
  cutscenes/ — Cutscenes pack (29 items), if present

Output names are normalized to seNNN.wav / jingleNNN.wav (lowercase).
"""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIRS = [
    ROOT / "tools/sfx-src/duels",
    ROOT / "tools/sfx-src/common",
    ROOT / "tools/sfx-src/cutscenes",
]
OUT = ROOT / "web/sfx"
NAME_RE = re.compile(r"^(se\d+(?:_\d+|_\d*shot)?|jingle\d+)\b", re.I)


def stem_of(path: Path) -> str | None:
    m = NAME_RE.match(path.stem.replace(" ", ""))
    if m:
        return m.group(1).lower()
    m = re.match(r"^(se\d+(?:_\d+|_\d*shot)?|jingle\d+)", path.name, re.I)
    return m.group(1).lower() if m else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    found = {}
    for src in SRC_DIRS:
        if not src.is_dir():
            print(f"skip missing {src.relative_to(ROOT)}")
            continue
        for path in src.rglob("*.wav"):
            key = stem_of(path)
            if not key:
                print(f"unparsed {path.relative_to(ROOT)}")
                continue
            # Prefer Duels over Common when both ship the same id (se001/se002).
            if key in found and "common" in str(path).lower() and "duels" in str(found[key]).lower():
                continue
            if key in found and "cutscenes" in str(path).lower():
                continue
            found[key] = path
    if not found:
        raise SystemExit("no wavs found under tools/sfx-src/{duels,common,cutscenes}")
    for key, path in sorted(found.items()):
        dest = OUT / f"{key}.wav"
        shutil.copy2(path, dest)
        print(f"{key} <- {path.relative_to(ROOT)} ({dest.stat().st_size})")
    print(f"installed {len(found)} clips into {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
