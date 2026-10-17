"""Normalize extracted Duel SFX into web/sfx/ as seNNN.wav / jingleNNN.wav.

Expects tools/sfx-src/duels/ (unzipped Duels pack from The Sounds Resource)
and optionally tools/sfx-src/common/. Keeps only clips the web client maps.
"""
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIRS = [ROOT / "tools/sfx-src/duels", ROOT / "tools/sfx-src/common"]
OUT = ROOT / "web/sfx"

# Clips referenced by web/sound.js (logical game events + UI).
KEEP = {
    "se001", "se002", "se011", "se017", "se017_2", "se022", "se023", "se024", "se026",
    "se028", "se029", "se030", "se034", "se036_1shot", "se037", "se038", "se046",
    "se047", "se048", "se059", "se060", "se061", "se063", "se064", "se067",
    "se070", "se071", "se072", "se073", "se074", "se075", "se076", "se077", "se078",
    "se079", "se080", "se081", "se082", "se083", "se084", "se085", "se086",
    "se087", "se088", "se089", "se090", "se091", "se092", "se093", "se094",
    "se114", "se121", "se122", "se123", "se124", "se129", "se130", "se142", "se165",
    "se171", "se172", "se188", "se212", "se219", "se226", "se233",
    "jingle001", "jingle002",
}

NAME_RE = re.compile(r"^(se\d+(?:_\d+|_\d+shot)?|jingle\d+)\b", re.I)


def stem_of(path: Path) -> str | None:
    m = NAME_RE.match(path.stem.replace(" ", ""))
    if m:
        return m.group(1).lower()
    # "se036_1shot - Spinner (Short).wav" / "se017_2 - Form Change B (alt).wav"
    m = re.match(r"^(se\d+(?:_\d+|_\d*shot)?|jingle\d+)", path.name, re.I)
    return m.group(1).lower() if m else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    found = {}
    for src in SRC_DIRS:
        if not src.is_dir():
            continue
        for path in src.rglob("*.wav"):
            key = stem_of(path)
            if not key or key not in KEEP:
                continue
            found[key] = path
    if not found:
        raise SystemExit("no wavs found under tools/sfx-src/{duels,common}")
    for key, path in sorted(found.items()):
        dest = OUT / f"{key}.wav"
        shutil.copy2(path, dest)
        print(f"{key} <- {path.relative_to(ROOT)} ({dest.stat().st_size})")
    missing = sorted(KEEP - found.keys())
    print(f"installed {len(found)}; missing {len(missing)}: {', '.join(missing) or 'none'}")


if __name__ == "__main__":
    main()
