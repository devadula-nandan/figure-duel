// The 3D table (the default view). It only draws: the page hands it the same model the flat board is drawn from (points, slots, figures, in board units)
// and gets clicks back through window.boardPick, so the rules, engine and HUD are exactly the ones the flat client uses.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BLUE = 0x1565c0, RED = 0xb71c1c, GOLD = 0xffd23f, host = document.getElementById('board3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x20264a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-4, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);

const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
// The table is one slate surface that runs past the edge of the view in every direction: a small tile (grain and a faint weave) repeated
// across a very large plane, fading into the distance. It carries no team colour: the goals, rings and bases do that.
const tileCanvas = document.createElement('canvas'); tileCanvas.width = tileCanvas.height = 256;
const tile = new THREE.CanvasTexture(tileCanvas); tile.colorSpace = THREE.SRGBColorSpace; tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(100, 100); tile.anisotropy = 8;
function paintTable() {
  const bd = css('--bd', '#0c0d10'), bd2 = css('--bd2', '#17191e'), line = css('--bd-line', '#c9ced8'), light = new THREE.Color(bd).getHSL({}).l > .5;
  let g = tileCanvas.getContext('2d'); g.globalAlpha = 1; g.fillStyle = new THREE.Color(bd).lerp(new THREE.Color(bd2), .5).getStyle(); g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .06; g.beginPath(); for (let k = -256; k < 512; k += 32) { g.moveTo(k, 0); g.lineTo(k + 256, 256); g.moveTo(k, 0); g.lineTo(k - 256, 256); } g.stroke();   // 32 px steps so the weave meets itself at the tile edges
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed seed: the grain is the same every time
  for (let k = 0; k < 7000; k++) { g.globalAlpha = rnd() * .1; g.fillStyle = rnd() < .5 ? '#000' : '#fff'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  g.globalAlpha = 1; tile.needsUpdate = true;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tile, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
scene.fog = new THREE.Fog(0x0c0d10, 28, 120);   // the far floor melts into the table colour instead of ending at a line

const mat = (color, emissive = 0, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, roughness: .45, ...o });
const M = { line: mat(0xdfe6ff, 0x30385c), pt: mat(0x0c1230), rim: mat(0xdfe6ff, 0x30385c), blue: mat(BLUE, 0x0a2a66), red: mat(RED, 0x4a0a12), mv: mat(GOLD, 0xa07800), slot: mat(0xdfe6ff, 0, { transparent: true, opacity: .5, side: THREE.DoubleSide }), unseen: new THREE.MeshBasicMaterial({ visible: false }), cap: mat(0x101216, 0, { transparent: true }), card: mat(0x2a2e36), edge: mat(0xd8dce4, 0, { roughness: .8 }) };
const band = (r, w, h) => {   // a ring of radius r, w wide and h tall, lying in the XY plane and centred on it (the meshes turn it flat)
  const outer = new THREE.Shape(); outer.absarc(0, 0, r + w / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, r - w / 2, 0, Math.PI * 2, true); outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false, curveSegments: 40 }); g.translate(0, 0, -h / 2); return g;
};
const G = { pt: new THREE.CylinderGeometry(.33, .33, .05, 36), rim: new THREE.CylinderGeometry(.4, .4, .03, 36), goal: new THREE.CylinderGeometry(.5, .5, .04, 40), slot: new THREE.RingGeometry(.38, .46, 36), dot: new THREE.CylinderGeometry(.135, .135, .05, 28), entry: band(.3, .06, .05), arrow: new THREE.CylinderGeometry(.16, .16, .05, 3), ring2: band(.43, .06, .05), goalDisc: new THREE.CircleGeometry(.38, 36), goalRim: new THREE.RingGeometry(.38, .46, 36), aura: new THREE.RingGeometry(.465, .615, 48), words: new THREE.PlaneGeometry(1.33, 1.33),
  base: new THREE.CylinderGeometry(.36, .4, .16, 32), cap: new THREE.CylinderGeometry(.33, .36, .03, 32), ring: band(.5, .07, .05) };
function applyTheme() {
  const bd = css('--bd', '#0c0d10'), line = css('--bd-line', '#c9ced8'), pt = css('--bd-pt', '#101216'), light = new THREE.Color(bd).getHSL({}).l > .5;
  paintTable(); scene.fog.color.set(bd).lerp(new THREE.Color(css('--bd2', '#17191e')), .5); scene.background = scene.fog.color;   // the sky is the table colour too, so there is no line where the far floor ends
  M.line.color.set(line); M.rim.color.set(line); M.slot.color.set(line); M.pt.color.set(pt); M.cap.color.set(pt);
  M.line.emissive.set(line).multiplyScalar(light ? 0 : .22); M.rim.emissive.copy(M.line.emissive);
  M.edge.color.set(pt).lerp(new THREE.Color(line), .7);   // the plates' cut edge
}
applyTheme(); new MutationObserver(() => { applyTheme(); extrasKey = ''; if (last) draw(last); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
const statics = new THREE.Group(), points = new Map(), tokens = new Map(), pickable = []; scene.add(statics);
let built = '', last = null;
// status conditions get an aura in their own colour; anything else with a marker gets a white one
const TINT = new THREE.Color();
const AURA = { poison: 0xa855f7, bad_poison: 0x6b21a8, burn: 0xff7a1a, paralyze: 0xfde047, sleep: 0x94a3b8, freeze: 0x67e8f9, melt: 0x67e8f9, panic: 0xf472b6, curse: 0x7c3aed };

function build(m) {   // routes, spots and slots never move during a duel (the far side is the near side turned around)
  statics.clear(); for (const g of points.values()) { const i = pickable.indexOf(g.userData.mark); if (i >= 0) pickable.splice(i, 1); } points.clear();
  // a route stops at the rim of an entry point's ring, and of a goal's, instead of running through it. (Lifting the goal disc over the
  // routes is not enough: from the duel's camera distance the two are too close in depth and the line shows through.)
  const rims = m.pts.filter(p => p.goal != null || [0, 6, 21, 27].includes(p.k)).map(p => [p.x, p.z, p.goal != null ? .46 : .33]);
  const cut = (q, to) => { const rim = rims.find(r => Math.hypot(r[0] - q[0], r[1] - q[1]) < .01); if (!rim) return q; const l = Math.hypot(to[0] - q[0], to[1] - q[1]); return [q[0] + (to[0] - q[0]) * rim[2] / l, q[1] + (to[1] - q[1]) * rim[2] / l]; };
  for (const [a0, b0] of m.edges) { const a = cut(a0, b0), b = cut(b0, a0), d = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), e = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, d.length()), M.line);
    e.position.set((a[0] + b[0]) / 2, .025, (a[1] + b[1]) / 2); e.rotation.y = Math.atan2(d.x, d.z); statics.add(e); }
  for (const s of m.slots) { const r = new THREE.Mesh(G.ring2, M.line); r.rotation.x = Math.PI / 2; r.position.set(s[0], .025, s[1]); r.castShadow = true; statics.add(r); }
  // Slots 12-15 are the P.C. spots (inner, outer for each side). A blunt raised arrow sits on each one's ring, pointing where its figure goes
  // next: the outer spot to the inner one, the inner one to the bench spot diagonally below it (slots 5 and 11, the back row's inner end).
  for (const [from, to, stem] of [[13, 12, .27], [12, 5, 0], [15, 14, .27], [14, 11, 0]]) {   // stem: length of the bar between ring and arrowhead (the outer spot's arrow has one)
    const s = m.slots[from], t = m.slots[to]; if (!s || !t) continue;
    const dx = t[0] - s[0], dz = t[1] - s[1], len = Math.hypot(dx, dz) || 1, a = new THREE.Mesh(G.arrow, M.line);
    a.scale.set(1, 1, .6); a.rotation.y = Math.atan2(dx, dz); a.position.set(s[0] + dx / len * (.475 + stem), .025, s[1] + dz / len * (.475 + stem)); a.castShadow = true; statics.add(a);   // base on the ring's centre line, or on the end of the stem
    if (stem) { const bar = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, stem), M.line); bar.rotation.y = a.rotation.y; bar.position.set(s[0] + dx / len * (.43 + stem / 2), .025, s[1] + dz / len * (.43 + stem / 2)); bar.castShadow = true; statics.add(bar); }
  }
  for (const p of m.pts) {   // `mark` is the dot or the goal disc, and it is the thing a tap hits
    const g = new THREE.Group(); let mark;
    if (p.goal == null) { mark = new THREE.Mesh(G.dot, M.line); mark.position.y = .025; mark.castShadow = true; g.add(mark);
      if ([0, 6, 21, 27].includes(p.k)) { const ring = new THREE.Mesh(G.entry, M.line); ring.rotation.x = Math.PI / 2; ring.position.y = .025; ring.castShadow = true; g.add(ring); } }
    else { mark = new THREE.Mesh(G.goalDisc, p.goal === 0 ? M.blue : M.red); mark.rotation.x = -Math.PI / 2; mark.position.y = .054; const rim = new THREE.Mesh(G.ring2, M.line); rim.rotation.x = Math.PI / 2; rim.position.y = .025; rim.castShadow = true; g.add(mark, rim); }
    g.position.set(p.x, 0, p.z); g.userData = { mark, plain: mark.material, goal: p.goal != null }; mark.userData.pick = g.userData; statics.add(g); points.set(p.k, g); pickable.push(mark);
  }
  built = m.pts.length + ':' + m.slots.length + ':' + m.edges.length;
}

const images = new Map(), loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
const picture = url => images.get(url) || images.set(url, loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; })).get(url);
function label(text, mpd) {   // movement points: red when lowered, green when raised
  return tex(96, 96, (g) => { if (text === '') return; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#05070f'; g.beginPath(); g.arc(48, 48, 40, 0, 7); g.fill();
    g.lineWidth = 7; g.strokeStyle = g.fillStyle = mpd < 0 ? '#ff6b7a' : mpd > 0 ? '#39d98a' : '#fff'; g.stroke(); g.font = '900 52px Segoe UI, sans-serif'; g.fillText(text, 48, 52); });
}
function around(text, ink) {   // the state names, written round the base and repeated to fill the circle
  return tex(512, 512, (g) => { g.translate(256, 256); g.font = '600 46px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
    const R = 208, unit = text.toUpperCase() + '  •  ', n = Math.max(1, Math.floor(2 * Math.PI * R / g.measureText(unit).width));
    for (let k = 0; k < n; k++) { let a = k * 2 * Math.PI / n; for (const ch of unit) { const w = g.measureText(ch).width / R; a += w / 2; g.save(); g.rotate(a); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); a += w / 2; } } });
}
const shadeTex = tex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const evoMap = tex(256, 80, (g, w, h) => { g.fillStyle = '#e8cb4d'; g.beginPath(); g.roundRect(6, 10, w - 12, h - 20, 28); g.fill(); g.lineWidth = 6; g.strokeStyle = '#914e00'; g.stroke(); g.fillStyle = '#520000'; g.font = '800 42px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EVOLVE', w / 2, h / 2 + 1); });
const shadeGeo = new THREE.PlaneGeometry(.62, .62);
function token(t) {
  const g = new THREE.Group(), base = new THREE.Mesh(G.base, mat(BLUE, 0, { transparent: true })), cap = new THREE.Mesh(G.cap, M.cap), ring = new THREE.Mesh(G.ring, mat(GOLD, 0xa07800)), aura = new THREE.Mesh(G.aura, new THREE.MeshBasicMaterial({ transparent: true, opacity: .8, side: THREE.DoubleSide }));
  const art = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .05, depthTest: false })), tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })), words = new THREE.Mesh(G.words, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  base.position.y = .08; base.castShadow = true; cap.position.y = .17; ring.rotation.x = Math.PI / 2; ring.position.y = .05; aura.rotation.x = -Math.PI / 2; aura.position.y = .02;
  art.center.set(.5, 0); art.position.y = .04; art.scale.set(1.05, 1.05, 1); art.renderOrder = 1; tag.position.set(.4, .08, .34); tag.scale.set(.36, .36, 1); tag.renderOrder = 2; words.rotation.x = -Math.PI / 2; words.position.y = .03;   // MP sits at the base's bottom right corner; the picture starts below the top of the base because the artwork has empty space under the figure
  const shade = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = .19;
  g.add(base, cap, shade, ring, aura, words, art, tag); g.position.set(t.x, 0, t.z); g.userData = { base, cap, shade, ring, art, tag, aura, words, fig: t.i };
  for (const m of [base, art, tag]) { m.userData.pick = g.userData; pickable.push(m); }   // the stand, the picture and the MP badge: what is drawn
  scene.add(g); tokens.set(t.i, g);
  return g;
}

// The original's table objects: each player's fanned stack of plates (cards 0.96 x 1.404, PlateObject 160 x 234 at scale 0.006) with the two
// corner markers of its table button, and the AI / End Turn / Z-Move button (collider 3 x 0.3 x 1; body and rim are its two meshes' sizes).
const extras = new THREE.Group(); scene.add(extras); let extrasKey = '';
const words = (text, w, h, ink, px) => tex(w, h, g => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.font = `900 ${px}px Segoe UI, sans-serif`; let s = 1; const tw = g.measureText(text).width; if (tw > w * .94) s = w * .94 / tw; g.translate(w / 2, h / 2); g.scale(s, s); g.fillText(text, 0, 0); });
// A plate card: a rounded slab 0.96 x 1.404 and 0.02 thick (the fan's own step, so the stack reads as a deck). Its face is painted here:
// a rarity band down the edge that shows in the fan, and on the top card a frame, the rarity, the name and the cost.
const cardGeo = (() => { const w = .48, h = .702, r = .07, s = new THREE.Shape(); s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false); s.lineTo(w, h - r); s.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w + r, h); s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false); s.lineTo(-w, -h + r); s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false); return new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false, curveSegments: 6 }); })();
const RARE = ['#8a8f98', '#8a8f98', '#2e9e5b', '#2f7fe0', '#d9a514', '#c0392b'], RARE_NAME = ['', 'C', 'UC', 'R', 'EX', 'UX'], faces = new Map();
function face(c, top) {
  const pt = css('--bd-pt', '#101216'), line = css('--bd-line', '#c9ced8'), key = [c.n, c.r, c.c, c.used, top, pt, line].join('|'); if (faces.has(key)) return faces.get(key);
  const t = tex(320, 468, (g, w, h) => {
    g.fillStyle = pt; g.fillRect(0, 0, w, h); const sheen = g.createLinearGradient(0, 0, w, h); sheen.addColorStop(0, 'rgba(255,255,255,.14)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    g.fillStyle = RARE[c.r] || RARE[1]; g.fillRect(0, 0, 30, h);
    if (top) { g.strokeStyle = line; g.globalAlpha = .55; g.lineWidth = 3; g.beginPath(); g.roundRect(48, 20, w - 68, h - 40, 14); g.stroke(); g.globalAlpha = 1;
      g.font = '800 26px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const rn = RARE_NAME[c.r] || ''; if (rn) { g.fillStyle = RARE[c.r]; g.beginPath(); g.roundRect(w - 96, 38, 60, 36, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(rn, w - 66, 57); }
      g.fillStyle = line; g.font = '800 36px Segoe UI, sans-serif'; const words = c.n.split(' '), lines = []; for (const x of words) { const l = lines[lines.length - 1]; if (l && g.measureText(l + ' ' + x).width < w - 96) lines[lines.length - 1] = l + ' ' + x; else lines.push(x); }
      lines.slice(0, 4).forEach((l, n) => g.fillText(l, (w + 30) / 2, h * .46 + (n - (Math.min(lines.length, 4) - 1) / 2) * 44, w - 90));
      g.fillStyle = css('--gold', '#ffd23f'); for (let n = 0; n < c.c; n++) { g.beginPath(); g.arc(78 + n * 36, h - 58, 13, 0, 7); g.fill(); } }
    if (c.used) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, w, h); }
  });
  t.repeat.set(1 / .96, 1 / 1.404); t.offset.set(.5, .5); faces.set(key, t); return t;   // the slab's face coordinates are its own x and y, centred
}
function drawTable(t) {
  const key = JSON.stringify(t); if (key === extrasKey) return; extrasKey = key;
  for (const o of extras.children) { const i = pickable.indexOf(o); if (i >= 0) pickable.splice(i, 1); }
  extras.clear();
  const flat = (w, d, y, material) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material); p.rotation.x = -Math.PI / 2; p.position.y = y; return p; }, hit = (w, h, d, x, z, act) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.unseen); b.position.set(x, h / 2, z); b.userData.pick = { act }; extras.add(b); pickable.push(b); };
  for (const k of t.stacks) {
    k.cards.forEach((c, i) => { const card = new THREE.Mesh(cardGeo, [new THREE.MeshStandardMaterial({ map: face(c, !i), roughness: .55 }), M.edge]);   // a real card: rounded, with thickness, a printed face and a pale cut edge
      card.rotation.x = -Math.PI / 2; if (k.s < 0) card.rotation.z = Math.PI; card.position.set(c.x, c.y - .02, k.z); card.castShadow = card.receiveShadow = true; extras.add(card); });
    if (k.mark) k.mark.forEach(([x, z]) => { const dx = Math.sign(k.x - x) * .3, dz = Math.sign(k.z - z) * .3; for (const [w, dd, ox, oz] of [[.3, .05, dx / 2, 0], [.05, .3, 0, dz / 2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .03, dd), M.mv); b.position.set(x + ox, .12, z + oz); extras.add(b); } });
    hit(1.8, .4, 1.5, k.x, k.z, k.act);
  }
  if (!t.btn.label) return;   // a same-screen game has no AI face, and nothing to press until End Turn or a Z-Move
  // the button, drawn like the board: a small rounded slab outlined in the route colour, filled with it when it can be pressed (sizes are its frame and body meshes)
  const slab = (w, d, r, h, material) => { const x = w / 2, y = d / 2, sh = new THREE.Shape(); sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false); sh.lineTo(x, y - r); sh.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
    sh.lineTo(-x + r, y); sh.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false); sh.lineTo(-x, -y + r); sh.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 8 }), material); m.rotation.x = -Math.PI / 2; m.position.set(t.btn.x, 0, t.btn.z); return m; };
  const rim = slab(2, .6, .11, .06, M.line), well = slab(1.9, .5, .08, .07, M.pt), body = slab(1.76, .4, .06, t.btn.on ? .12 : .075, t.btn.on ? M.line : M.pt); rim.castShadow = body.castShadow = true;
  const name = flat(1.6, .28, t.btn.on ? .125 : .08, new THREE.MeshBasicMaterial({ map: words(t.btn.label.toUpperCase(), 400, 70, css(t.btn.on ? '--bd' : '--bd-line', '#888'), 46), transparent: true, opacity: t.btn.on ? 1 : .45 })); name.position.x = t.btn.x; name.position.z = t.btn.z;
  extras.add(rim, well, body, name); hit(2, .3, .6, t.btn.x, t.btn.z, 'main');
}
function draw(m) {
  if (m.table) drawTable(m.table);
  const cam = JSON.stringify(m.cam) !== JSON.stringify(last && last.cam); last = m; if (built !== m.pts.length + ':' + m.slots.length + ':' + m.edges.length) build(m); if (cam) home();
  for (const p of m.pts) { const u = points.get(p.k).userData; u.pt = p.p; u.mv = !!p.mv; u.mark.material = p.mv ? M.mv : u.plain; u.mark.scale.setScalar(p.mv && !u.goal ? 1.6 : 1); }
  const seen = new Set();
  for (const t of m.toks) {
    const g = tokens.get(t.i) || token(t), u = g.userData; seen.add(t.i);
    u.to = new THREE.Vector3(t.x, 0, t.z); if (t.moveId != null && t.path && u.moveId !== t.moveId) { u.moveId = t.moveId; u.hop = { pts: t.path.map(q => new THREE.Vector3(q[0], 0, q[1])), t: 0 }; }   // a move along a route: hop point to point
    u.base.material.color.setHex(t.team ? RED : BLUE); u.base.material.emissive.setHex(t.team ? 0x3a060c : 0x08224f);
    u.ring.visible = t.sel || t.atk; u.ring.material = t.atk ? M.red : M.mv; u.art.material.opacity = u.evoBlast ? 0 : (t.dim ? .5 : 1); const hue = AURA[t.status] || (t.status ? 0xffffff : 0xcbd5e1), dark = ((hue >> 16) * 299 + (hue >> 8 & 255) * 587 + (hue & 255) * 114) / 1000 > 140;   // text goes on the ring, dark on light rings and white on dark ones
    u.aura.visible = !!(t.status || t.badge); u.aura.material.color.setHex(hue);
    if (AURA[t.status]) u.art.material.color.setHex(0xffffff).lerp(TINT.setHex(AURA[t.status]), .5); else u.art.material.color.setHex(t.wait ? 0x8a93a8 : 0xffffff);
    if (u.img !== t.img) { u.img = t.img; u.art.material.map = t.img ? picture(t.img) : tex(128, 128, (c) => { c.fillStyle = '#fff'; c.font = '700 22px Segoe UI, sans-serif'; c.textAlign = 'center'; c.fillText(t.name.slice(0, 9), 64, 70); }); u.art.material.needsUpdate = true; }
    u.words.visible = !!t.badge; if (t.badge && u.badge !== t.badge + dark) { u.badge = t.badge + dark; u.words.material.map = around(t.badge, dark ? '#05070f' : '#fff'); u.words.material.needsUpdate = true; }
    const key = t.mp + '|' + t.mpd; if (u.key !== key) { u.key = key; u.tag.material.map = label(t.mp, t.mpd); u.tag.material.needsUpdate = true; }
    if (t.evo) {   // the Evolve button, a billboard just above the figure
      if (!u.evo) { u.evo = new THREE.Sprite(new THREE.SpriteMaterial({ map: evoMap, transparent: true, depthTest: false })); u.evo.center.set(.5, 0); u.evo.position.set(0, 1.22, 0); u.evo.scale.set(1.05, .34, 1); u.evo.renderOrder = 9; u.evo.userData.pick = { act: 'evo:' + t.i }; g.add(u.evo); pickable.push(u.evo); }
    } else if (u.evo) { g.remove(u.evo); const k = pickable.indexOf(u.evo); if (k >= 0) pickable.splice(k, 1); u.evo.material.dispose(); u.evo = null; }
  }
  for (const [i, g] of tokens) if (seen.has(i) && m.snap) g.position.copy(g.userData.to);
  for (const [i, g] of tokens) if (!seen.has(i)) { scene.remove(g); tokens.delete(i); for (const m of [g.userData.base, g.userData.art, g.userData.tag, g.userData.evo]) { if (!m) continue; const k = pickable.indexOf(m); if (k >= 0) pickable.splice(k, 1); } }
}

// Camera: drag to orbit, wheel or pinch to zoom, no panning, kept above the table. Reset returns to the default view; Lock stops drags moving it.
const controls = new OrbitControls(camera, renderer.domElement); controls.enablePan = false; controls.minPolarAngle = Math.PI * .1; controls.maxPolarAngle = Math.PI * .42;
let moved = false; controls.addEventListener('start', () => { moved = true; });
const CAM_KEY = 'pokemonduelweb.cam'; let kept = null; try { let raw = localStorage.getItem(CAM_KEY); if (raw == null) { const old = localStorage.getItem('figureduel.cam'); if (old != null) { raw = old; localStorage.setItem(CAM_KEY, old); localStorage.removeItem('figureduel.cam'); } } kept = JSON.parse(raw); } catch (e) {}
if (!(kept && Array.isArray(kept.pos) && Array.isArray(kept.at))) kept = null;
function keepCamera() {   // called whenever the lock changes or a locked view is reset: store the view while locked, forget it when unlocked
  kept = controls.enabled ? null : { pos: camera.position.toArray(), at: controls.target.toArray() };
  try { kept ? localStorage.setItem(CAM_KEY, JSON.stringify(kept)) : localStorage.removeItem(CAM_KEY); } catch (e) {}
}
function home(reset) {   // reset = the Reset button: go to the default view even when a locked view is remembered.
  // the whole table, both benches included, from behind the near player; a model may bring its own camera: { pos, at, width } (width = how much of the scene must fit across)
  const d = Math.max(.92, .57 / camera.aspect) * 20.5,   // far enough for the table's depth (.92) or its width (.55 / aspect), whichever needs more, so a narrow screen is filled side to side
     c = last && last.cam, at = new THREE.Vector3(...(c ? c.at : [0, 0, 1.25])), pos = c ? new THREE.Vector3(...c.pos) : new THREE.Vector3(0, d * .84, d * .55 + 1.25)   // aimed a little towards the near side, where the plates and the button are;
  if (c) pos.lerpVectors(at, pos, Math.max(1, c.width / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect) / pos.distanceTo(at)));
  const far = pos.distanceTo(at); controls.minDistance = far * .5; controls.maxDistance = far * 1.3; camera.position.copy(pos); controls.target.copy(at); controls.update(); moved = false;
  if (kept && !c && reset !== true) { camera.position.fromArray(kept.pos); controls.target.fromArray(kept.at); controls.update(); moved = true; }   // the remembered locked view (not in scenes that bring their own camera)
}
function fit() {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); controls.rotateSpeed = Math.min(1, h / 600);   // orbit speed is per canvas height, so a short canvas would spin too fast
  if (!moved) home();
}
new ResizeObserver(fit).observe(host); fit();
host.style.position = 'relative';
// the camera buttons go in the page's menu when it has a place for them (id "camBar"), else in a corner of the table
const camBar = document.getElementById('camBar');
if (camBar) camBar.innerHTML = '<button id="camReset">Reset view</button><button id="camLock">Lock view</button>';
else host.insertAdjacentHTML('beforeend', '<div style="position:absolute;left:8px;bottom:8px;display:flex;gap:6px"><button id="camReset" style="padding:3px 10px;font-size:12px">Reset view</button><button id="camLock" style="padding:3px 10px;font-size:12px">Lock view</button></div>');
document.getElementById('camReset').onclick = () => { home(true); if (!controls.enabled) keepCamera(); };
document.getElementById('camLock').onclick = e => { controls.enabled = !controls.enabled; e.target.textContent = controls.enabled ? 'Lock view' : 'Unlock view'; keepCamera(); };
if (kept) { controls.enabled = false; document.getElementById('camLock').textContent = 'Unlock view'; home(); }

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function spriteSolid(hit) {   // the clear margin of a picture is not part of the figure; only an opaque pixel is
  const map = hit.object.material && hit.object.material.map, uv = hit.uv, img = map && map.image;
  if (!map || !uv || !img || !img.width) return true;
  let c = map.userData.ink; if (c == null) { c = document.createElement('canvas'); c.width = img.width; c.height = img.height; try { c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0); } catch (e) { c = false; } map.userData.ink = c; }
  if (!c) return true;
  try { const a = c.getContext('2d').getImageData(Math.min(c.width - 1, uv.x * c.width | 0), Math.min(c.height - 1, (1 - uv.y) * c.height | 0), 1, 1).data[3]; return a > 13; }
  catch (e) { map.userData.ink = false; return true; }
}
function tapTarget(cx, cy) {   // the ray hits the picture, the stand, the badge or the node that is actually there
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set((cx - rect.left) / rect.width * 2 - 1, -(cy - rect.top) / rect.height * 2 + 1); ray.setFromCamera(mouse, camera);
  for (const h of ray.intersectObjects(pickable, false)) {
    const pick = h.object.userData.pick; if (!pick) continue;
    if (h.object.isSprite && !spriteSolid(h)) continue;
    if (pick.act) return { act: pick.act };
    if (pick.fig != null) return { fig: pick.fig };
    if (pick.pt != null) return pick.mv ? { pt: pick.pt } : null;
  }
  return null;
}
function chooseTap(cx, cy) {
  const t = tapTarget(cx, cy); if (!t) return;
  window.boardPick(t.fig != null ? t.fig : null, t.pt != null ? t.pt : null, t.act || null);
}
let downAt = null, holdTimer = 0;
const TAP = 12;   // a drag orbits the camera; a tap does not move
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button) return; downAt = { x: e.clientX, y: e.clientY, held: false }; clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {   // a held press opens the figure's detail (the original's long tap) and is not a move or an attack
    if (!downAt) return; const t = tapTarget(downAt.x, downAt.y);
    if (!t || t.fig == null || t.pt != null || t.act) return;
    downAt.held = true; if (window.boardDetail) window.boardDetail(t.fig);
  }, 480);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > TAP) clearTimeout(holdTimer); });
window.addEventListener('pointercancel', () => { downAt = null; clearTimeout(holdTimer); });
window.addEventListener('pointerup', e => {
  if (!downAt) return; const d = downAt; downAt = null; clearTimeout(holdTimer);
  const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP;
  if (d.held && !moved) window.holdClick = true;   // the release after a hold must not also select, move or attack
  if (d.held || moved) return;
  chooseTap(e.clientX, e.clientY);
});

const clock = new THREE.Clock(), TILT = .3, STEP = .17;   // TILT: how far (radians) the camera must rise from the lowest side view before figures are fully centred on their bases   // seconds per hop, the same pace as the flat board
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), pulse = .6 + .4 * Math.sin(clock.elapsedTime * 5);
  // Seen from the side a figure stands on its base; seen from above a standing picture would hang off the far edge of the base, so as the
  // camera rises from the lowest side view the picture slides down, and after a slight tilt it sits centred on the base like a token.
  // It is lifted clear of the base as it centres, or the base would hide it.
  const rise = Math.min(1, Math.max(0, (controls.maxPolarAngle - controls.getPolarAngle()) / TILT)), lie = rise * rise * (3 - 2 * rise) * .45;
  for (const g of tokens.values()) { const u = g.userData; u.art.center.y = lie; u.art.position.y = .04 + lie * .6; if (u.evoBlast) u.art.material.opacity = 0; if (u.aura.visible) u.aura.material.opacity = .6 + .3 * pulse; if (u.words.visible) u.words.rotation.z -= dt * .5; if (u.hop) { const h = u.hop, k = Math.floor(h.t += dt / STEP); if (k >= h.pts.length - 1) { g.position.copy(h.pts[h.pts.length - 1]); u.hop = null; } else { g.position.lerpVectors(h.pts[k], h.pts[k + 1], h.t - k); g.position.y = Math.sin((h.t - k) * Math.PI) * .45; } }
    else if (u.to) g.position.lerp(u.to, 1 - Math.pow(.001, dt)); if (u.ring.visible) u.ring.scale.setScalar(.95 + .08 * pulse); }
  stepBlasts(dt);
  // Each figure is drawn whole, from the farthest to the nearest: its base, then its picture (which ignores depth, so its own base cannot
  // cut it off), then its MP badge. A nearer figure's base and picture therefore cover whatever stands behind them. The bases are marked
  // transparent only so that they take part in this ordering; they are fully opaque.
  [...tokens.values()].sort((p, q) => q.position.distanceToSquared(camera.position) - p.position.distanceToSquared(camera.position)).forEach((g, i) => {
    const u = g.userData, n = 5 * i; u.base.renderOrder = n + 1; u.cap.renderOrder = n + 2; u.shade.renderOrder = n + 3; u.art.renderOrder = n + 4; u.tag.renderOrder = n + 5; if (u.evo) u.evo.renderOrder = n + 6;
  });
  M.mv.emissiveIntensity = pulse;
  renderer.render(scene, camera);
});

// A glowing sphere in the scene, not a flat disc on the page. It swells over the figure, hides it, then fades so the new one shows through.
const blastGeo = new THREE.SphereGeometry(1, 40, 28);
const blastGlow = tex(128, 128, g => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(.22, 'rgba(255,244,180,.55)'); r.addColorStop(.5, 'rgba(130,210,255,.22)'); r.addColorStop(1, 'rgba(130,210,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
const blasts = [];
function endBlast(b) {
  if (b.dead) return; b.dead = true;
  if (b.g) b.g.userData.evoBlast = false;
  scene.remove(b.grp); b.core.material.dispose(); b.shell.material.dispose(); b.halo.material.dispose();
  if (!b.readyFired) { b.readyFired = true; b.markReady(); }
  b.finish();
}
function blast(i) {
  const g = tokens.get(i);
  if (!g) { const p = Promise.resolve(); return { ready: p, done: p, release() {} }; }
  const core = new THREE.Mesh(blastGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4c8, emissiveIntensity: 3.2, roughness: .18, metalness: .04, transparent: true, depthTest: false, depthWrite: false }));
  const shell = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: blastGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
  const light = new THREE.PointLight(0xd7f3ff, 0, 2.2);
  core.renderOrder = shell.renderOrder = halo.renderOrder = 20000;
  const grp = new THREE.Group(); grp.add(shell, core, halo, light); grp.position.copy(g.position); grp.position.y += .5; scene.add(grp);
  g.userData.evoBlast = true; g.userData.art.material.opacity = 0;
  const b = { g, grp, core, shell, halo, light, phase: 'grow', t: 0, dead: false, readyFired: false };
  b.ready = new Promise(r => { b.markReady = r; }); b.done = new Promise(r => { b.finish = r; });
  b.release = () => { if (!b.dead && b.phase !== 'fade') { b.wantFade = true; if (b.phase === 'hold') { b.phase = 'fade'; b.t = 0; } } };
  blasts.push(b);
  return { ready: b.ready, done: b.done, release: () => b.release() };
}
function stepBlasts(dt) {
  for (let n = blasts.length - 1; n >= 0; n--) {
    const b = blasts[n]; b.t += dt;
    b.grp.position.copy(b.g.position); b.grp.position.y += .5; b.grp.rotation.y += dt * 1.8;
    if (b.phase === 'grow') {
      const k = Math.min(1, b.t / .42), e = 1 - Math.pow(1 - k, 3), o = Math.min(1, k * 1.5);
      b.core.scale.setScalar(.05 + e * .37); b.shell.scale.setScalar(.06 + e * .46); b.halo.scale.setScalar(.12 + e * .9);
      b.core.material.opacity = o; b.shell.material.opacity = o * .5; b.halo.material.opacity = o * .95; b.light.intensity = o * 3.5;
      if (k >= 1) { b.phase = b.wantFade ? 'fade' : 'hold'; b.t = 0; if (!b.readyFired) { b.readyFired = true; b.markReady(); } }
    } else if (b.phase === 'hold') {
      b.core.scale.setScalar(.42 + Math.sin(b.t * 9) * .012); b.shell.scale.setScalar(.52); b.halo.scale.setScalar(1.05);
      b.core.material.opacity = 1; b.shell.material.opacity = .5; b.halo.material.opacity = .95; b.light.intensity = 3.5;
      if (b.t > 2.8) { b.phase = 'fade'; b.t = 0; }
    } else {
      const k = Math.min(1, b.t / .55), e = k * k, o = 1 - e;
      if (b.g.userData.evoBlast) { b.g.userData.evoBlast = false; b.g.userData.art.material.opacity = 1; }   // the new figure is there as the sphere thins
      b.core.scale.setScalar(.42 + e * .18); b.shell.scale.setScalar(.52 + e * .28); b.halo.scale.setScalar(1.05 + e * .35);
      b.core.material.opacity = o; b.shell.material.opacity = o * .45; b.halo.material.opacity = o * .8; b.light.intensity = o * 3.5;
      if (k >= 1) { endBlast(b); blasts.splice(n, 1); }
    }
  }
}
function clearBlasts() { for (const b of blasts) endBlast(b); blasts.length = 0; }
function project(i) {   // where a figure sits on the arena, so the evolution flash can land on it
  const g = tokens.get(i); if (!g) return null;
  const v = g.position.clone(); v.y += .7; v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect(), host = (document.querySelector('.arena') || renderer.domElement.parentElement).getBoundingClientRect();
  return { x: (v.x * .5 + .5) * rect.width + rect.left - host.left, y: (-v.y * .5 + .5) * rect.height + rect.top - host.top };
}
window.Board3D = { draw, controls, tokens, project, blast, clearBlasts };   // controls and tokens are exposed for inspection
if (window.board3dModel) draw(window.board3dModel);
