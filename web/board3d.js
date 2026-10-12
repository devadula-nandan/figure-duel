// The 3D table for /3d/. It only draws: the page hands it the same model the flat board is drawn from (points, slots, figures, in board units)
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
// across a very large plane, fading into the distance. Each side's colour is a soft glow laid over it at that side's end.
const tileCanvas = document.createElement('canvas'); tileCanvas.width = tileCanvas.height = 256;
const tile = new THREE.CanvasTexture(tileCanvas); tile.colorSpace = THREE.SRGBColorSpace; tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(100, 100); tile.anisotropy = 8;
const glowCanvas = document.createElement('canvas'); glowCanvas.width = 256; glowCanvas.height = 512;
const glowTex = new THREE.CanvasTexture(glowCanvas); glowTex.colorSpace = THREE.SRGBColorSpace;
function paintTable() {
  const bd = css('--bd', '#0c0d10'), bd2 = css('--bd2', '#17191e'), line = css('--bd-line', '#c9ced8'), light = new THREE.Color(bd).getHSL({}).l > .5;
  let g = tileCanvas.getContext('2d'); g.globalAlpha = 1; g.fillStyle = new THREE.Color(bd).lerp(new THREE.Color(bd2), .5).getStyle(); g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 1; g.globalAlpha = .06; g.beginPath(); for (let k = -256; k < 512; k += 32) { g.moveTo(k, 0); g.lineTo(k + 256, 256); g.moveTo(k, 0); g.lineTo(k - 256, 256); } g.stroke();   // 32 px steps so the weave meets itself at the tile edges
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed seed: the grain is the same every time
  for (let k = 0; k < 7000; k++) { g.globalAlpha = rnd() * .1; g.fillStyle = rnd() < .5 ? '#000' : '#fff'; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  g.globalAlpha = 1; tile.needsUpdate = true;
  g = glowCanvas.getContext('2d'); g.clearRect(0, 0, 256, 512);
  for (const [cy, c] of [[96, css('--p1', '#ff4658')], [416, css('--p0', '#2f8cff')]]) { const col = new THREE.Color(c), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    g.save(); g.translate(128, cy); g.scale(1, .72); const r = g.createRadialGradient(0, 0, 0, 0, 0, 128); r.addColorStop(0, `rgba(${rgb},${light ? .5 : .42})`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(-128, -180, 256, 360); g.restore(); }
  glowTex.needsUpdate = true;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tile, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 26), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = .004; scene.add(glow);
scene.fog = new THREE.Fog(0x0c0d10, 28, 120);   // the far floor melts into the table colour instead of ending at a line

const mat = (color, emissive = 0, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, roughness: .45, ...o });
const M = { line: mat(0xdfe6ff, 0x30385c), pt: mat(0x0c1230), rim: mat(0xdfe6ff, 0x30385c), blue: mat(BLUE, 0x0a2a66), red: mat(RED, 0x4a0a12), mv: mat(GOLD, 0xa07800), slot: mat(0xdfe6ff, 0, { transparent: true, opacity: .25 }) };
const G = { pt: new THREE.CylinderGeometry(.33, .33, .05, 36), rim: new THREE.CylinderGeometry(.4, .4, .03, 36), goal: new THREE.CylinderGeometry(.5, .5, .04, 40), slot: new THREE.RingGeometry(.36, .42, 36), aura: new THREE.RingGeometry(.42, .66, 40), words: new THREE.PlaneGeometry(1.33, 1.33),
  base: new THREE.CylinderGeometry(.36, .4, .16, 32), cap: new THREE.CylinderGeometry(.33, .36, .03, 32), ring: new THREE.TorusGeometry(.5, .035, 10, 40), hit: new THREE.CylinderGeometry(.42, .42, 1.1, 12) };
function applyTheme() {
  const bd = css('--bd', '#0c0d10'), line = css('--bd-line', '#c9ced8'), pt = css('--bd-pt', '#101216'), light = new THREE.Color(bd).getHSL({}).l > .5;
  paintTable(); scene.fog.color.set(bd).lerp(new THREE.Color(css('--bd2', '#17191e')), .5); scene.background = scene.fog.color;   // the sky is the table colour too, so there is no line where the far floor ends
  M.line.color.set(line); M.rim.color.set(line); M.slot.color.set(line); M.pt.color.set(pt);
  M.line.emissive.set(line).multiplyScalar(light ? 0 : .22); M.rim.emissive.copy(M.line.emissive);
}
applyTheme(); new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
const statics = new THREE.Group(), points = new Map(), tokens = new Map(), pickable = []; scene.add(statics);
let built = '', last = null;
// status conditions get an aura in their own colour; anything else with a marker gets a white one
const AURA = { poison: 0xa855f7, bad_poison: 0x6b21a8, burn: 0xff7a1a, paralyze: 0xfde047, sleep: 0x94a3b8, freeze: 0x67e8f9, melt: 0x67e8f9, panic: 0xf472b6, curse: 0x7c3aed };

function build(m) {   // routes, spots and slots never move during a duel (the far side is the near side turned around)
  statics.clear(); for (const g of points.values()) pickable.splice(pickable.indexOf(g.userData.disc), 1); points.clear();
  for (const [a, b] of m.edges) { const d = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), e = new THREE.Mesh(new THREE.BoxGeometry(.09, .02, d.length()), M.line);
    e.position.set((a[0] + b[0]) / 2, .01, (a[1] + b[1]) / 2); e.rotation.y = Math.atan2(d.x, d.z); statics.add(e); }
  for (const s of m.slots) { const r = new THREE.Mesh(G.slot, M.slot); r.rotation.x = -Math.PI / 2; r.position.set(s[0], .012, s[1]); statics.add(r); }
  for (const p of m.pts) { const g = new THREE.Group(), rim = new THREE.Mesh(p.goal == null ? G.rim : G.goal, p.goal === 0 ? M.blue : p.goal === 1 ? M.red : M.rim), disc = new THREE.Mesh(G.pt, M.pt);
    rim.position.y = .015; disc.position.y = .03; disc.receiveShadow = true; g.add(rim, disc); g.position.set(p.x, 0, p.z); g.userData = { disc }; disc.userData.pick = g.userData; statics.add(g); points.set(p.k, g); pickable.push(disc); }
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
function token(t) {
  const g = new THREE.Group(), base = new THREE.Mesh(G.base, mat(BLUE)), cap = new THREE.Mesh(G.cap, mat(0x121820, 0, { transparent: true, opacity: .35 })), ring = new THREE.Mesh(G.ring, mat(GOLD, 0xa07800)), hit = new THREE.Mesh(G.hit, new THREE.MeshBasicMaterial({ visible: false })), aura = new THREE.Mesh(G.aura, new THREE.MeshBasicMaterial({ transparent: true, opacity: .8, side: THREE.DoubleSide }));
  const art = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .05 })), tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })), words = new THREE.Mesh(G.words, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  base.position.y = .08; base.castShadow = true; cap.position.y = .17; ring.rotation.x = Math.PI / 2; ring.position.y = .05; hit.position.y = .55; aura.rotation.x = -Math.PI / 2; aura.position.y = .02;
  art.center.set(.5, 0); art.position.y = .18; art.scale.set(1.05, 1.05, 1); tag.position.set(.4, .08, .34); tag.scale.set(.36, .36, 1); tag.renderOrder = 2; words.rotation.x = -Math.PI / 2; words.position.y = .03;   // MP sits at the base's bottom right corner
  g.add(base, cap, ring, hit, aura, words, art, tag); g.position.set(t.x, 0, t.z); g.userData = { base, ring, art, tag, hit, aura, words, fig: t.i }; hit.userData.pick = g.userData; scene.add(g); pickable.push(hit); tokens.set(t.i, g);
  return g;
}

function draw(m) {
  const cam = JSON.stringify(m.cam) !== JSON.stringify(last && last.cam); last = m; if (built !== m.pts.length + ':' + m.slots.length + ':' + m.edges.length) build(m); if (cam) home();
  for (const p of m.pts) { const u = points.get(p.k).userData; u.pt = p.p; u.disc.material = p.mv ? M.mv : M.pt; }
  const seen = new Set();
  for (const t of m.toks) {
    const g = tokens.get(t.i) || token(t), u = g.userData; seen.add(t.i);
    u.to = new THREE.Vector3(t.x, 0, t.z); u.base.material.color.setHex(t.team ? RED : BLUE); u.base.material.emissive.setHex(t.team ? 0x3a060c : 0x08224f);
    u.ring.visible = t.sel || t.atk; u.ring.material = t.atk ? M.red : M.mv; u.art.material.opacity = t.dim ? .5 : 1; const hue = AURA[t.status] || (t.status ? 0xffffff : 0xcbd5e1), dark = ((hue >> 16) * 299 + (hue >> 8 & 255) * 587 + (hue & 255) * 114) / 1000 > 140;   // text goes on the ring, dark on light rings and white on dark ones
    u.aura.visible = !!(t.status || t.badge); u.aura.material.color.setHex(hue);
    u.art.material.color.setHex(t.status === 'freeze' || t.status === 'melt' ? 0x9be7ff : t.status === 'sleep' || t.wait ? 0x8a93a8 : 0xffffff);
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
function home() {   // the whole table, both benches included, from behind the near player; a model may bring its own camera: { pos, at, width } (width = how much of the scene must fit across)
  const d = Math.max(1, .66 / camera.aspect) * 19, c = last && last.cam, at = new THREE.Vector3(...(c ? c.at : [0, 0, .75])), pos = c ? new THREE.Vector3(...c.pos) : new THREE.Vector3(0, d * .84, d * .55 + .75);
  if (c) pos.lerpVectors(at, pos, Math.max(1, c.width / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect) / pos.distanceTo(at)));
  const far = pos.distanceTo(at); controls.minDistance = far * .5; controls.maxDistance = far * 1.3; camera.position.copy(pos); controls.target.copy(at); controls.update(); moved = false;
}
function fit() {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); controls.rotateSpeed = Math.min(1, h / 600);   // orbit speed is per canvas height, so a short canvas would spin too fast
  if (!moved) home();
}
new ResizeObserver(fit).observe(host); fit();
host.style.position = 'relative';
host.insertAdjacentHTML('beforeend', '<div style="position:absolute;left:8px;bottom:8px;display:flex;gap:6px"><button id="camReset" style="padding:3px 10px;font-size:12px">Reset view</button><button id="camLock" style="padding:3px 10px;font-size:12px">Lock view</button></div>');
document.getElementById('camReset').onclick = home;
document.getElementById('camLock').onclick = e => { controls.enabled = !controls.enabled; e.target.textContent = controls.enabled ? 'Lock view' : 'Unlock view'; };

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = [0, 0]; renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('click', e => {
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(pickable, false).map(x => x.object.userData.pick), fig = hits.find(u => u.fig != null), pt = hits.find(u => u.pt != null);
  window.boardPick(fig ? fig.fig : null, pt ? pt.pt : null);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), pulse = .6 + .4 * Math.sin(clock.elapsedTime * 5);
  for (const g of tokens.values()) { const u = g.userData; if (u.aura.visible) u.aura.material.opacity = .6 + .3 * pulse; if (u.words.visible) u.words.rotation.z -= dt * .5; if (u.to) g.position.lerp(u.to, 1 - Math.pow(.001, dt)); if (u.ring.visible) u.ring.scale.setScalar(.95 + .08 * pulse); }
  M.mv.emissiveIntensity = pulse;
  renderer.render(scene, camera);
});

window.Board3D = { draw, controls };   // controls are exposed for inspection
if (window.board3dModel) draw(window.board3dModel);
