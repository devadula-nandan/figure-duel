// Original Pokémon Duel SFX. Clips live in sfx/ (from the Duels/Common banks); synth bank is only a fallback
// when a clip is missing. sfx(name) plays a logical event. Button id "soundBtn" toggles mute.
// Browsers only allow sound after the visitor has clicked or tapped once.
(() => {
  const SOUND_KEY = 'pokemonduelweb.sound'; let actx = null, noiseBuf = null, master = null, soundOn = true;
  try { let saved = localStorage.getItem(SOUND_KEY); if (saved == null) { const old = localStorage.getItem('figureduel.sound'); if (old != null) { saved = old; localStorage.setItem(SOUND_KEY, old); localStorage.removeItem('figureduel.sound'); } } soundOn = saved !== 'off'; } catch (e) {}
  function ready() {
    if (!soundOn) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; }
    if (!master) { master = actx.createGain(); master.gain.value = .85; master.connect(actx.destination); }
    if (!noiseBuf) {
      const n = actx.sampleRate, d = (noiseBuf = actx.createBuffer(1, n, n)).getChannelData(0); let s = 1;
      for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    return actx;
  }
  const UI_GAIN = .12, SFX_GAIN = .7;
  function level(vol, ui) { return ui || vol >= .32 ? vol : vol + (.32 - vol) * .78; }
  function burst(t, at, dur, vol, freq, q, type, ui) {
    vol = level(vol, ui);
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.setValueAtTime(Math.max(40, freq), t + at); f.Q.value = q || .7;
    g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
    src.connect(f).connect(g).connect(master); src.start(t + at); src.stop(t + at + dur + .02);
    return f;
  }
  function tone(t, type, f0, f1, at, dur, vol) {
    vol = level(vol);
    const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + at + dur);
    g.gain.setValueAtTime(.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(.02, dur * .3)); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
    o.connect(g).connect(master); o.start(t + at); o.stop(t + at + dur + .02);
  }
  const bank = {
    select: t => burst(t, 0, .03, .22, 2400, 1, 'highpass'),
    click: t => burst(t, 0, .03, .05, 2400, 1, 'highpass', true),
    back: t => burst(t, 0, .04, .045, 900, 1, 'bandpass', true),
    step: t => { burst(t, 0, .07, .4, 140, .8); burst(t, .01, .03, .12, 900, 1, 'bandpass'); },
    land: t => { burst(t, 0, .05, .35, 220, 1); burst(t, .012, .04, .18, 1100, 2, 'bandpass'); },
    spin: t => { for (let k = 0; k < 14; k++) burst(t, 1.15 * Math.pow(k / 14, 1.7), .02, .16, 1600 + (k % 3) * 180, 3, 'bandpass'); },
    miss: t => { const f = burst(t, 0, .2, .16, 1800, .6, 'bandpass'); f.frequency.exponentialRampToValueAtTime(280, t + .2); },
    hit: t => { burst(t, 0, .16, .45, 90, .6); burst(t, 0, .045, .28, 1400, 1.4, 'bandpass'); },
    gold: t => { burst(t, 0, .14, .4, 120, .7); burst(t, 0, .06, .22, 2200, 2, 'bandpass'); tone(t, 'triangle', 1568, 1175, .01, .22, .08); },
    purple: t => { burst(t, 0, .2, .2, 700, 2, 'bandpass'); tone(t, 'sine', 880, 1320, 0, .16, .07); tone(t, 'sine', 1320, 660, .08, .22, .05); },
    blue: t => { tone(t, 'triangle', 988, 988, 0, .1, .09); tone(t, 'triangle', 1319, 1319, .08, .14, .08); burst(t, 0, .08, .12, 3000, 1, 'highpass'); },
    ko: t => { burst(t, 0, .28, .5, 70, .5); burst(t, .02, .08, .3, 600, 1, 'bandpass'); tone(t, 'sine', 180, 55, .04, .35, .12); },
    draw: t => { burst(t, 0, .06, .22, 400, 1, 'bandpass'); burst(t, .09, .06, .18, 320, 1, 'bandpass'); },
    attack: t => { const f = burst(t, 0, .18, .22, 500, .8, 'bandpass'); f.frequency.exponentialRampToValueAtTime(1800, t + .18); },
    plate: t => { burst(t, 0, .025, .2, 3200, 1, 'highpass'); burst(t, .03, .05, .16, 500, 1); },
    ability: t => { tone(t, 'sine', 740, 1180, 0, .12, .07); burst(t, 0, .14, .1, 2000, 2, 'bandpass'); },
    win: t => { [523, 659, 784, 1047].forEach((f, k) => { tone(t, 'triangle', f, f, k * .11, .2, .1); burst(t, k * .11, .04, .05, f * 2, 1, 'bandpass'); }); },
    lose: t => { [392, 330, 262, 196].forEach((f, k) => tone(t, 'triangle', f, f, k * .14, .26, .09)); burst(t, 0, .4, .08, 180, .5); },
    turn: t => { burst(t, 0, .04, .2, 1800, 2, 'bandpass'); burst(t, .08, .06, .16, 2400, 2, 'bandpass'); },
    st_poison: t => [0, .08, .16].forEach((at, k) => burst(t, at, .07, .2, 700 - k * 140, 2, 'bandpass')),
    st_bad_poison: t => [0, .07, .14, .21].forEach((at, k) => burst(t, at, .09, .22, 420 - k * 60, 2, 'bandpass')),
    st_burn: t => { for (let k = 0; k < 10; k++) burst(t, k * .03, .04, .14, 400 + (k * 470) % 1800, 1.2, 'bandpass'); },
    st_paralyze: t => { for (let k = 0; k < 6; k++) burst(t, k * .028, .02, .2, k % 2 ? 2800 : 900, 4, 'highpass'); },
    st_sleep: t => { const f = burst(t, 0, .5, .1, 400, .6, 'lowpass'); f.frequency.linearRampToValueAtTime(180, t + .5); },
    st_freeze: t => { burst(t, 0, .12, .16, 5000, 2, 'highpass'); tone(t, 'sine', 2400, 1800, .02, .35, .05); },
    st_panic: t => { for (let k = 0; k < 5; k++) burst(t, k * .06, .04, .16, k % 2 ? 1600 : 700, 3, 'bandpass'); },
    st_curse: t => { burst(t, 0, .45, .28, 90, .5); tone(t, 'sine', 110, 70, .02, .4, .06); },
    evolve: t => { const f = burst(t, 0, .55, .18, 300, .7, 'bandpass'); f.frequency.exponentialRampToValueAtTime(2800, t + .5); tone(t, 'sine', 880, 1760, .15, .3, .06); tone(t, 'triangle', 1320, 2640, .32, .28, .05); },
    wait: t => { burst(t, 0, .16, .2, 240, .7); tone(t, 'sine', 520, 180, .02, .22, .05); },
    cancel: t => burst(t, 0, .05, .16, 500, 1, 'bandpass'),
    mp_up: t => [523, 659, 784].forEach((f, k) => tone(t, 'triangle', f, f, k * .06, .1, .08)),
    mp_down: t => [659, 523, 392].forEach((f, k) => tone(t, 'triangle', f, f, k * .07, .12, .08)),
    st_other: t => burst(t, 0, .1, .16, 900, 1, 'bandpass'),
    duel_start: t => bank.land(t),
    first: t => bank.turn(t),
    goal: t => bank.ko(t),
    end_turn: t => bank.turn(t)
  };
  bank.st_melt = t => bank.st_freeze(t);

  // Logical event -> original clip id (Duels / Common banks). Sequences play in order with a short gap.
  const ORIG = {
    click: 'se001', back: 'se002',
    select: 'se028', cancel: 'se029',
    step: 'se011', land: 'se011', ai_step: 'se034',
    spin: 'se024', spin_short: 'se036_1shot', spin_stop: 'se037',
    miss: 'se060', hit: 'se172', gold: 'se188', purple: 'se073', blue: 'se067',
    ko: 'se038', draw: 'se063', attack: 'se061',
    plate: 'se114', plate_pick: 'se030', plate_ok: 'se047', plate_cancel: 'se142',
    ability: 'se121', ability_bad: 'se122',
    win: 'jingle001', lose: 'jingle002',
    turn: 'se026', end_turn: 'se219',
    evolve: ['se165', 'se017_2'],
    wait: 'se103',
    mp_up: 'se123', mp_down: 'se124',
    st_poison: 'se091', st_bad_poison: 'se092', st_burn: 'se093', st_paralyze: 'se090',
    st_sleep: 'se089', st_freeze: 'se094', st_melt: 'se094', st_panic: 'se088', st_curse: 'se122',
    st_other: 'se087',
    duel_start: 'se022', first: 'se226', goal: 'se212', swap: 'se048',
    // type-coloured attack impacts (optional; hit falls back to se172)
    type_dark: 'se070', type_electric: 'se071', type_grass: 'se072', type_psychic: 'se073',
    type_fighting: 'se074', type_steel: 'se075', type_fire: 'se076', type_water: 'se077',
    type_ice: 'se078', type_poison: 'se079', type_ground: 'se080', type_flying: 'se081',
    type_bug: 'se082', type_rock: 'se083', type_ghost: 'se084', type_dragon: 'se085', type_fairy: 'se086'
  };
  // se103 (Wait) is not in the public Duels dump — fall back below
  const ORIG_FALLBACK = { wait: 'se087' };

  const clips = {}, loading = {};
  const ALL_IDS = [...new Set(Object.values(ORIG).flat().concat(Object.values(ORIG_FALLBACK)))];

  function takeClip(id, bytes) {
    const c = actx || ready(); if (!c) { clips[id] = bytes; return; }
    c.decodeAudioData(bytes.slice(0)).then(buf => { clips[id] = buf; }).catch(() => { delete clips[id]; });
  }
  function loadId(id) {
    if (!id || clips[id] || loading[id]) return loading[id];
    return loading[id] = fetch('sfx/' + id + '.wav').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) takeClip(id, b); else delete loading[id]; return b; }).catch(() => { delete loading[id]; });
  }
  ALL_IDS.forEach(loadId);

  function playClip(id, ui) {
    let buf = clips[id];
    if (buf instanceof ArrayBuffer) { takeClip(id, buf); buf = clips[id]; }
    if (!buf || !buf.getChannelData) return false;
    const src = actx.createBufferSource(); src.buffer = buf; const g = actx.createGain(); g.gain.value = ui ? UI_GAIN : SFX_GAIN;
    src.connect(g).connect(master); src.start(); return true;
  }
  function resolveIds(name) {
    let id = ORIG[name];
    if (id == null) return [];
    const list = Array.isArray(id) ? id.slice() : [id];
    return list.map(x => (clips[x] || loading[x] ? x : (ORIG_FALLBACK[name] || x)));
  }
  function sfx(name) {
    const c = ready(); if (!c) return;
    const ids = resolveIds(name), ui = name === 'click' || name === 'back';
    try {
      if (ids.length) {
        let any = false;
        ids.forEach((id, i) => {
          if (clips[id] instanceof ArrayBuffer) takeClip(id, clips[id]);
          const go = () => { if (playClip(id, ui)) any = true; };
          if (i === 0) go(); else setTimeout(go, 180 * i);
        });
        if (any) return;
      }
      if (bank[name]) bank[name](c.currentTime);
    } catch (e) {}
  }
  window.sfx = sfx;
  const STATUS = { poison: 1, bad_poison: 1, burn: 1, paralyze: 1, sleep: 1, freeze: 1, melt: 1, panic: 1, curse: 1 };
  window.mpSfx = change => { if (change) sfx(change > 0 ? 'mp_up' : 'mp_down'); };
  window.statusSfx = kind => sfx(STATUS[kind] ? 'st_' + kind : 'st_other');
  const draw = () => { const b = document.getElementById('soundBtn'); if (!b) return; b.classList.add('iconbtn');
    b.innerHTML = icon('<path d="M4 9v6h4l5 4V5L8 9H4z"/>' + (soundOn ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M16 9l5 6M21 9l-5 6"/>')); b.title = 'Sound: ' + (soundOn ? 'on' : 'off'); b.setAttribute('aria-label', b.title); };
  addEventListener('DOMContentLoaded', () => { draw(); const b = document.getElementById('soundBtn'); if (b) b.onclick = () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {} draw(); sfx('click'); }; });
  addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('button, [role="button"], a, summary, .row, .tcard, .pchip');
    if (!el || el.disabled || el.id === 'soundBtn' || el.closest('#nav') || el.getAttribute('aria-disabled') === 'true') return;
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    sfx(/^(close|back)\b/i.test(label) || el.classList.contains('x') ? 'back' : 'click');
  }, true);
})();
