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

// the table: a dark slab, red at the far end and blue at the near end
const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const top = tex(256, 512, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, '#7a1626'); l.addColorStop(.42, '#1a1638'); l.addColorStop(.58, '#14183c'); l.addColorStop(1, '#123c9c'); g.fillStyle = l; g.fillRect(0, 0, w, h); });
const slab = new THREE.Mesh(new THREE.BoxGeometry(8.4, .4, 13.6), [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial(i === 2 ? { map: top, roughness: .55 } : { color: 0x0a0e1e, roughness: .7 })));
slab.position.y = -.2; slab.receiveShadow = true; scene.add(slab);
const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.4; scene.add(floor);

const mat = (color, emissive = 0, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, roughness: .45, ...o });
const M = { line: mat(0xdfe6ff, 0x30385c), pt: mat(0x0c1230), rim: mat(0xdfe6ff, 0x30385c), blue: mat(BLUE, 0x0a2a66), red: mat(RED, 0x4a0a12), mv: mat(GOLD, 0xa07800), slot: mat(0xdfe6ff, 0, { transparent: true, opacity: .25 }) };
const G = { pt: new THREE.CylinderGeometry(.33, .33, .05, 36), rim: new THREE.CylinderGeometry(.4, .4, .03, 36), goal: new THREE.CylinderGeometry(.5, .5, .04, 40), slot: new THREE.RingGeometry(.36, .42, 36), aura: new THREE.RingGeometry(.42, .66, 40), words: new THREE.PlaneGeometry(1.33, 1.33),
  base: new THREE.CylinderGeometry(.36, .4, .16, 32), cap: new THREE.CylinderGeometry(.33, .36, .03, 32), ring: new THREE.TorusGeometry(.5, .035, 10, 40), hit: new THREE.CylinderGeometry(.42, .42, 1.1, 12) };
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
