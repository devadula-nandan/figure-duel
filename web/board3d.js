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
const M = { line: mat(0xdfe6ff, 0x30385c), pt: mat(0x0c1230), rim: mat(0xdfe6ff, 0x30385c), blue: mat(BLUE, 0x0a2a66), red: mat(RED, 0x4a0a12), mv: mat(GOLD, 0xa07800), slot: mat(0xdfe6ff, 0, { transparent: true, opacity: .5, side: THREE.DoubleSide }), unseen: new THREE.MeshBasicMaterial({ visible: false }), cap: mat(0x101216, 0, { transparent: true }) };
const band = (r, w, h) => {   // a ring of radius r, w wide and h tall, lying in the XY plane and centred on it (the meshes turn it flat)
  const outer = new THREE.Shape(); outer.absarc(0, 0, r + w / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, r - w / 2, 0, Math.PI * 2, true); outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false, curveSegments: 40 }); g.translate(0, 0, -h / 2); return g;
};
const G = { pt: new THREE.CylinderGeometry(.33, .33, .05, 36), rim: new THREE.CylinderGeometry(.4, .4, .03, 36), goal: new THREE.CylinderGeometry(.5, .5, .04, 40), slot: new THREE.RingGeometry(.38, .46, 36), dot: new THREE.CylinderGeometry(.135, .135, .05, 28), entry: band(.3, .06, .05), arrow: new THREE.CylinderGeometry(.16, .16, .05, 3), ring2: band(.43, .06, .05), goalDisc: new THREE.CircleGeometry(.38, 36), goalRim: new THREE.RingGeometry(.38, .46, 36), spot: new THREE.CylinderGeometry(.4, .4, .14, 16), aura: new THREE.RingGeometry(.465, .615, 48), words: new THREE.PlaneGeometry(1.33, 1.33),
  base: new THREE.CylinderGeometry(.36, .4, .16, 32), cap: new THREE.CylinderGeometry(.33, .36, .03, 32), ring: band(.5, .07, .05), hit: new THREE.CylinderGeometry(.42, .42, 1.1, 12) };
function applyTheme() {
  const bd = css('--bd', '#0c0d10'), line = css('--bd-line', '#c9ced8'), pt = css('--bd-pt', '#101216'), light = new THREE.Color(bd).getHSL({}).l > .5;
  paintTable(); scene.fog.color.set(bd).lerp(new THREE.Color(css('--bd2', '#17191e')), .5); scene.background = scene.fog.color;   // the sky is the table colour too, so there is no line where the far floor ends
  M.line.color.set(line); M.rim.color.set(line); M.slot.color.set(line); M.pt.color.set(pt); M.cap.color.set(pt);
  M.line.emissive.set(line).multiplyScalar(light ? 0 : .22); M.rim.emissive.copy(M.line.emissive);
}
applyTheme(); new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
const statics = new THREE.Group(), points = new Map(), tokens = new Map(), pickable = []; scene.add(statics);
let built = '', last = null;
// status conditions get an aura in their own colour; anything else with a marker gets a white one
const TINT = new THREE.Color();
const AURA = { poison: 0xa855f7, bad_poison: 0x6b21a8, burn: 0xff7a1a, paralyze: 0xfde047, sleep: 0x94a3b8, freeze: 0x67e8f9, melt: 0x67e8f9, panic: 0xf472b6, curse: 0x7c3aed };

function build(m) {   // routes, spots and slots never move during a duel (the far side is the near side turned around)
  statics.clear(); for (const g of points.values()) pickable.splice(pickable.indexOf(g.userData.disc), 1); points.clear();
  for (const [a, b] of m.edges) { const d = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), e = new THREE.Mesh(new THREE.BoxGeometry(.06, .05, d.length()), M.line);
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
  for (const p of m.pts) {   // `mark` is the part that turns gold and grows when the selected figure can move here; `spot` is the unseen, larger click target
    const g = new THREE.Group(), spot = new THREE.Mesh(G.spot, M.unseen); let mark;
    if (p.goal == null) { mark = new THREE.Mesh(G.dot, M.line); mark.position.y = .025; mark.castShadow = true; g.add(mark);
      if ([0, 6, 21, 27].includes(p.k)) { const ring = new THREE.Mesh(G.entry, M.line); ring.rotation.x = Math.PI / 2; ring.position.y = .025; ring.castShadow = true; g.add(ring); } }
    else { mark = new THREE.Mesh(G.goalDisc, p.goal === 0 ? M.blue : M.red); mark.rotation.x = -Math.PI / 2; mark.position.y = .054; const rim = new THREE.Mesh(G.ring2, M.line); rim.rotation.x = Math.PI / 2; rim.position.y = .025; rim.castShadow = true; g.add(mark, rim); }
    spot.position.y = .07; g.add(spot); g.position.set(p.x, 0, p.z); g.userData = { disc: spot, mark, plain: mark.material, goal: p.goal != null }; spot.userData.pick = g.userData; statics.add(g); points.set(p.k, g); pickable.push(spot);
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
const shadeGeo = new THREE.PlaneGeometry(.62, .62);
function token(t) {
  const g = new THREE.Group(), base = new THREE.Mesh(G.base, mat(BLUE, 0, { transparent: true })), cap = new THREE.Mesh(G.cap, M.cap), ring = new THREE.Mesh(G.ring, mat(GOLD, 0xa07800)), hit = new THREE.Mesh(G.hit, new THREE.MeshBasicMaterial({ visible: false })), aura = new THREE.Mesh(G.aura, new THREE.MeshBasicMaterial({ transparent: true, opacity: .8, side: THREE.DoubleSide }));
  const art = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .05, depthTest: false })), tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })), words = new THREE.Mesh(G.words, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  base.position.y = .08; base.castShadow = true; cap.position.y = .17; ring.rotation.x = Math.PI / 2; ring.position.y = .05; hit.position.y = .55; aura.rotation.x = -Math.PI / 2; aura.position.y = .02;
  art.center.set(.5, 0); art.position.y = .04; art.scale.set(1.05, 1.05, 1); art.renderOrder = 1; tag.position.set(.4, .08, .34); tag.scale.set(.36, .36, 1); tag.renderOrder = 2; words.rotation.x = -Math.PI / 2; words.position.y = .03;   // MP sits at the base's bottom right corner; the picture starts below the top of the base because the artwork has empty space under the figure
  const shade = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = .19;
  g.add(base, cap, shade, ring, hit, aura, words, art, tag); g.position.set(t.x, 0, t.z); g.userData = { base, cap, shade, ring, art, tag, hit, aura, words, fig: t.i }; hit.userData.pick = g.userData; scene.add(g); pickable.push(hit); tokens.set(t.i, g);
  return g;
}

function draw(m) {
  const cam = JSON.stringify(m.cam) !== JSON.stringify(last && last.cam); last = m; if (built !== m.pts.length + ':' + m.slots.length + ':' + m.edges.length) build(m); if (cam) home();
  for (const p of m.pts) { const u = points.get(p.k).userData; u.pt = p.p; u.mark.material = p.mv ? M.mv : u.plain; u.mark.scale.setScalar(p.mv && !u.goal ? 1.6 : 1); }
  const seen = new Set();
  for (const t of m.toks) {
    const g = tokens.get(t.i) || token(t), u = g.userData; seen.add(t.i);
    u.to = new THREE.Vector3(t.x, 0, t.z); if (t.moveId != null && t.path && u.moveId !== t.moveId) { u.moveId = t.moveId; u.hop = { pts: t.path.map(q => new THREE.Vector3(q[0], 0, q[1])), t: 0 }; }   // a move along a route: hop point to point
    u.base.material.color.setHex(t.team ? RED : BLUE); u.base.material.emissive.setHex(t.team ? 0x3a060c : 0x08224f);
    u.ring.visible = t.sel || t.atk; u.ring.material = t.atk ? M.red : M.mv; u.art.material.opacity = t.dim ? .5 : 1; const hue = AURA[t.status] || (t.status ? 0xffffff : 0xcbd5e1), dark = ((hue >> 16) * 299 + (hue >> 8 & 255) * 587 + (hue & 255) * 114) / 1000 > 140;   // text goes on the ring, dark on light rings and white on dark ones
    u.aura.visible = !!(t.status || t.badge); u.aura.material.color.setHex(hue);
    if (AURA[t.status]) u.art.material.color.setHex(0xffffff).lerp(TINT.setHex(AURA[t.status]), .5); else u.art.material.color.setHex(t.wait ? 0x8a93a8 : 0xffffff);
    if (u.img !== t.img) { u.img = t.img; u.art.material.map = t.img ? picture(t.img) : tex(128, 128, (c) => { c.fillStyle = '#fff'; c.font = '700 22px Segoe UI, sans-serif'; c.textAlign = 'center'; c.fillText(t.name.slice(0, 9), 64, 70); }); u.art.material.needsUpdate = true; }
    u.words.visible = !!t.badge; if (t.badge && u.badge !== t.badge + dark) { u.badge = t.badge + dark; u.words.material.map = around(t.badge, dark ? '#05070f' : '#fff'); u.words.material.needsUpdate = true; }
    const key = t.mp + '|' + t.mpd; if (u.key !== key) { u.key = key; u.tag.material.map = label(t.mp, t.mpd); u.tag.material.needsUpdate = true; }
  }
  for (const [i, g] of tokens) if (seen.has(i) && m.snap) g.position.copy(g.userData.to);
  for (const [i, g] of tokens) if (!seen.has(i)) { scene.remove(g); tokens.delete(i); pickable.splice(pickable.indexOf(g.userData.hit), 1); }
}

// Camera: drag to orbit, wheel or pinch to zoom, no panning, kept above the table. Reset returns to the default view; Lock stops drags moving it.
const controls = new OrbitControls(camera, renderer.domElement); controls.enablePan = false; controls.minPolarAngle = Math.PI * .1; controls.maxPolarAngle = Math.PI * .42;
let moved = false; controls.addEventListener('start', () => { moved = true; });
const CAM_KEY = 'figureduel.cam'; let kept = null; try { kept = JSON.parse(localStorage.getItem(CAM_KEY)); } catch (e) {}
if (!(kept && Array.isArray(kept.pos) && Array.isArray(kept.at))) kept = null;
function keepCamera() {   // called whenever the lock changes or a locked view is reset: store the view while locked, forget it when unlocked
  kept = controls.enabled ? null : { pos: camera.position.toArray(), at: controls.target.toArray() };
  try { kept ? localStorage.setItem(CAM_KEY, JSON.stringify(kept)) : localStorage.removeItem(CAM_KEY); } catch (e) {}
}
function home(reset) {   // reset = the Reset button: go to the default view even when a locked view is remembered.
  // the whole table, both benches included, from behind the near player; a model may bring its own camera: { pos, at, width } (width = how much of the scene must fit across)
  const d = Math.max(1, .72 / camera.aspect) * 20.5, c = last && last.cam, at = new THREE.Vector3(...(c ? c.at : [0, 0, .75])), pos = c ? new THREE.Vector3(...c.pos) : new THREE.Vector3(0, d * .84, d * .55 + .75);
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
let downAt = [0, 0]; renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('click', e => {
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(pickable, false).map(x => x.object.userData.pick), fig = hits.find(u => u.fig != null), pt = hits.find(u => u.pt != null);
  window.boardPick(fig ? fig.fig : null, pt ? pt.pt : null);
});

const clock = new THREE.Clock(), TILT = .3, STEP = .17;   // TILT: how far (radians) the camera must rise from the lowest side view before figures are fully centred on their bases   // seconds per hop, the same pace as the flat board
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), pulse = .6 + .4 * Math.sin(clock.elapsedTime * 5);
  // Seen from the side a figure stands on its base; seen from above a standing picture would hang off the far edge of the base, so as the
  // camera rises from the lowest side view the picture slides down, and after a slight tilt it sits centred on the base like a token.
  // It is lifted clear of the base as it centres, or the base would hide it.
  const rise = Math.min(1, Math.max(0, (controls.maxPolarAngle - controls.getPolarAngle()) / TILT)), lie = rise * rise * (3 - 2 * rise) * .45;
  for (const g of tokens.values()) { const u = g.userData; u.art.center.y = lie; u.art.position.y = .04 + lie * .6; if (u.aura.visible) u.aura.material.opacity = .6 + .3 * pulse; if (u.words.visible) u.words.rotation.z -= dt * .5; if (u.hop) { const h = u.hop, k = Math.floor(h.t += dt / STEP); if (k >= h.pts.length - 1) { g.position.copy(h.pts[h.pts.length - 1]); u.hop = null; } else { g.position.lerpVectors(h.pts[k], h.pts[k + 1], h.t - k); g.position.y = Math.sin((h.t - k) * Math.PI) * .45; } }
    else if (u.to) g.position.lerp(u.to, 1 - Math.pow(.001, dt)); if (u.ring.visible) u.ring.scale.setScalar(.95 + .08 * pulse); }
  // Each figure is drawn whole, from the farthest to the nearest: its base, then its picture (which ignores depth, so its own base cannot
  // cut it off), then its MP badge. A nearer figure's base and picture therefore cover whatever stands behind them. The bases are marked
  // transparent only so that they take part in this ordering; they are fully opaque.
  [...tokens.values()].sort((p, q) => q.position.distanceToSquared(camera.position) - p.position.distanceToSquared(camera.position)).forEach((g, i) => {
    const u = g.userData, n = 5 * i; u.base.renderOrder = n + 1; u.cap.renderOrder = n + 2; u.shade.renderOrder = n + 3; u.art.renderOrder = n + 4; u.tag.renderOrder = n + 5;
  });
  M.mv.emissiveIntensity = pulse;
  renderer.render(scene, camera);
});

window.Board3D = { draw, controls, tokens };   // controls and tokens are exposed for inspection
if (window.board3dModel) draw(window.board3dModel);
