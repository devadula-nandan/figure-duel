# pokemon duel web

A web client for [Pokémon Duel](https://en.wikipedia.org/wiki/Pokémon_Duel). The rules are computed by the original game's own rule engine, run in the browser under an ARM emulator. Nothing is installed and nothing runs on a server.

- `web/` is the whole site (static files): the game on its 3D table at `/`, the same game on a flat board at `/2d/`, the 3D storybook at `/storybook/`.
- `play.py` serves `web/` locally at http://localhost:8765 and hands the page the engine library straight from the APK next to it.
- `tools/` holds the scripts that build `web/data.js` and the native test harness.

## The rule engine

The engine library (`web/libTFG.so`) is taken from the original Android app, version 7.0.16, so the static site is playable with no APK upload. The browser caches it in IndexedDB after the first load. If that file is missing, the page falls back to reading the library from a local 7.0.16 APK once.

## Run locally

```bash
python play.py
```

`play.py` still needs the APK next to it when you use the Python engine processes; the in-page engine loads `web/libTFG.so` (or `/libTFG.so` served from the APK).

## Notes

Figure pictures are linked from the PokeAPI sprite collection at view time; none are stored here. three.js (for the 3D table) and PeerJS (for online rooms) load from a CDN.

This is a fan project for personal and educational use, not affiliated with or endorsed by the owners of the original game.
