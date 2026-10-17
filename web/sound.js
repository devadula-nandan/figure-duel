// Original Pokémon Duel audio. SFX from web/sfx/, BGM from web/bgm/. Synth is only a last-resort fallback.
// sfx(name) plays a logical event. bgm.play(id) / bgm.stop() handle music.
// Sound button cycles: all (music+sfx) → sfx → off. Preference is stored in localStorage.
(() => {
  const SOUND_KEY = 'pokemonduelweb.sound';
  const MODES = ['all', 'sfx', 'off'];
  let actx = null, noiseBuf = null, master = null, musicGain = null, mode = 'all', bgmSrc = null, bgmId = null, resumeWait = null;
  try {
    let saved = localStorage.getItem(SOUND_KEY);
    if (saved == null) {
      const old = localStorage.getItem('figureduel.sound');
      if (old != null) { saved = old; localStorage.removeItem('figureduel.sound'); }
    }
    if (saved === 'on' || saved === 'all') mode = 'all';
    else if (saved === 'sfx') mode = 'sfx';
    else if (saved === 'off') mode = 'off';
    else mode = 'all';
    localStorage.setItem(SOUND_KEY, mode);
  } catch (e) {}

  const sfxOn = () => mode !== 'off';
  const musicOn = () => mode === 'all';
  const persist = () => { try { localStorage.setItem(SOUND_KEY, mode); } catch (e) {} };

  function ensureCtx() {
    if (!sfxOn()) return Promise.resolve(null);
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return Promise.resolve(null); }
    if (!master) { master = actx.createGain(); master.gain.value = .9; master.connect(actx.destination); }
    if (!musicGain) { musicGain = actx.createGain(); musicGain.gain.value = .45; musicGain.connect(actx.destination); }
    if (!noiseBuf) {
      const n = actx.sampleRate, d = (noiseBuf = actx.createBuffer(1, n, n)).getChannelData(0); let s = 1;
      for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    if (actx.state === 'running') return Promise.resolve(actx);
    if (!resumeWait) {
      resumeWait = actx.resume().then(() => actx).catch(() => actx).finally(() => { resumeWait = null; });
    }
    return resumeWait;
  }

  // Sync path for synth bank / quick checks after ensureCtx has run.
  function ready() {
    if (!sfxOn() || !actx) return null;
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }

  const UI_GAIN = .14, SFX_GAIN = .75;
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
    g.gain.setValueAtTime(.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(.02, dur * .3));
    g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
    o.connect(g).connect(master); o.start(t + at); o.stop(t + at + dur + .02);
  }
  const bank = {
    select: t => burst(t, 0, .03, .22, 2400, 1, 'highpass'),
    click: t => burst(t, 0, .03, .05, 2400, 1, 'highpass', true),
    back: t => burst(t, 0, .04, .045, 900, 1, 'bandpass', true),
    step: t => { burst(t, 0, .07, .4, 140, .8); burst(t, .01, .03, .12, 900, 1, 'bandpass'); },
    land: t => { burst(t, 0, .05, .35, 220, 1); burst(t, .012, .04, .18, 1100, 2, 'bandpass'); },
    spin: t => { for (let k = 0; k < 14; k++) burst(t, 1.15 * Math.pow(k / 14, 1.7), .02, .16, 1600 + (k % 3) * 180, 3, 'bandpass'); },
    spin_short: t => bank.spin(t), spin_stop: t => bank.land(t),
    miss: t => { const f = burst(t, 0, .2, .16, 1800, .6, 'bandpass'); f.frequency.exponentialRampToValueAtTime(280, t + .2); },
    hit: t => { burst(t, 0, .16, .45, 90, .6); burst(t, 0, .045, .28, 1400, 1.4, 'bandpass'); },
    gold: t => { burst(t, 0, .14, .4, 120, .7); burst(t, 0, .06, .22, 2200, 2, 'bandpass'); tone(t, 'triangle', 1568, 1175, .01, .22, .08); },
    purple: t => { burst(t, 0, .2, .2, 700, 2, 'bandpass'); tone(t, 'sine', 880, 1320, 0, .16, .07); },
    blue: t => { tone(t, 'triangle', 988, 988, 0, .1, .09); burst(t, 0, .08, .12, 3000, 1, 'highpass'); },
    ko: t => { burst(t, 0, .28, .5, 70, .5); burst(t, .02, .08, .3, 600, 1, 'bandpass'); },
    draw: t => { burst(t, 0, .06, .22, 400, 1, 'bandpass'); burst(t, .09, .06, .18, 320, 1, 'bandpass'); },
    attack: t => { const f = burst(t, 0, .18, .22, 500, .8, 'bandpass'); f.frequency.exponentialRampToValueAtTime(1800, t + .18); },
    plate: t => { burst(t, 0, .025, .2, 3200, 1, 'highpass'); burst(t, .03, .05, .16, 500, 1); },
    plate_pick: t => bank.plate(t), plate_ok: t => bank.select(t), plate_cancel: t => bank.cancel(t), plate_energy: t => bank.ability(t),
    ability: t => { tone(t, 'sine', 740, 1180, 0, .12, .07); burst(t, 0, .14, .1, 2000, 2, 'bandpass'); },
    ability_bad: t => bank.st_curse(t),
    win: t => { [523, 659, 784, 1047].forEach((f, k) => tone(t, 'triangle', f, f, k * .11, .2, .1)); },
    lose: t => { [392, 330, 262, 196].forEach((f, k) => tone(t, 'triangle', f, f * .97, k * .14, .26, .09)); },
    turn: t => { burst(t, 0, .04, .2, 1800, 2, 'bandpass'); burst(t, .08, .06, .16, 2400, 2, 'bandpass'); },
    end_turn: t => bank.turn(t),
    st_poison: t => [0, .08, .16].forEach((at, k) => burst(t, at, .07, .2, 700 - k * 140, 2, 'bandpass')),
    st_bad_poison: t => [0, .07, .14, .21].forEach((at, k) => burst(t, at, .09, .22, 420 - k * 60, 2, 'bandpass')),
    st_burn: t => { for (let k = 0; k < 10; k++) burst(t, k * .03, .04, .14, 400 + (k * 470) % 1800, 1.2, 'bandpass'); },
    st_paralyze: t => { for (let k = 0; k < 6; k++) burst(t, k * .028, .02, .2, k % 2 ? 2800 : 900, 4, 'highpass'); },
    st_sleep: t => { const f = burst(t, 0, .5, .1, 400, .6, 'lowpass'); f.frequency.linearRampToValueAtTime(180, t + .5); },
    st_freeze: t => { burst(t, 0, .12, .16, 5000, 2, 'highpass'); },
    st_panic: t => { for (let k = 0; k < 5; k++) burst(t, k * .06, .04, .16, k % 2 ? 1600 : 700, 3, 'bandpass'); },
    st_curse: t => { burst(t, 0, .45, .28, 90, .5); },
    evolve: t => { const f = burst(t, 0, .55, .18, 300, .7, 'bandpass'); f.frequency.exponentialRampToValueAtTime(2800, t + .5); },
    wait: t => { burst(t, 0, .16, .2, 240, .7); },
    cancel: t => burst(t, 0, .05, .16, 500, 1, 'bandpass'),
    mp_up: t => [523, 659, 784].forEach((f, k) => tone(t, 'triangle', f, f, k * .06, .1, .08)),
    mp_down: t => [659, 523, 392].forEach((f, k) => tone(t, 'triangle', f, f, k * .07, .12, .08)),
    st_other: t => burst(t, 0, .1, .16, 900, 1, 'bandpass'),
    duel_start: t => bank.land(t), first: t => bank.turn(t), goal: t => bank.ko(t),
    surround: t => { burst(t, 0, .2, .4, 120, .6); burst(t, .05, .25, .28, 600, 1, 'bandpass'); },
    swap: t => bank.step(t), cured: t => bank.ability(t), attack_phase: t => bank.attack(t)
  };
  bank.st_melt = t => bank.st_freeze(t);

  // Logical event -> original clip id(s). Sequences play in order.
  const ORIG = {
    click: 'se001', back: 'se002',
    select: 'se028', cancel: 'se029',
    step: 'se011', land: 'se011', ai_step: 'se034',
    spin: 'se024', spin_short: 'se036_1shot', spin_stop: 'se037',
    miss: 'se060', hit: 'se172', gold: 'se188', purple: 'se073', blue: 'se067',
    ko: 'se038', draw: 'se063', attack: 'se061', attack_phase: 'se233',
    plate: 'se114', plate_pick: 'se030', plate_ok: 'se047', plate_cancel: 'se142',
    plate_energy: 'se129', plate_action: 'se130',
    ability: 'se121', ability_bad: 'se122',
    win: 'jingle001', lose: 'jingle002',
    turn: 'se026', end_turn: 'se219',
    evolve: ['se165', 'se017_2'],
    wait: 'se087',
    mp_up: 'se123', mp_down: 'se124',
    st_poison: 'se091', st_bad_poison: 'se092', st_burn: 'se093', st_paralyze: 'se090',
    st_sleep: 'se089', st_freeze: 'se094', st_melt: 'se094', st_panic: 'se088', st_curse: 'se122',
    st_other: 'se087', cured: 'se046',
    duel_start: 'se022', first: 'se226', goal: 'se212', swap: 'se048', surround: 'se035',
    type_dark: 'se070', type_electric: 'se071', type_grass: 'se072', type_psychic: 'se073',
    type_fighting: 'se074', type_steel: 'se075', type_fire: 'se076', type_water: 'se077',
    type_ice: 'se078', type_poison: 'se079', type_ground: 'se080', type_flying: 'se081',
    type_bug: 'se082', type_rock: 'se083', type_ghost: 'se084', type_dragon: 'se085', type_fairy: 'se086'
  };

  const raw = {}, clips = {}, decoding = {}, failed = {}, loading = {};
  const ALL_IDS = [...new Set(Object.values(ORIG).flat())];

  function fetchRaw(id) {
    if (!id || failed[id]) return Promise.resolve(null);
    if (raw[id]) return Promise.resolve(raw[id]);
    if (loading[id]) return loading[id];
    return loading[id] = fetch('sfx/' + id + '.wav').then(r => r.ok ? r.arrayBuffer() : null).then(b => {
      delete loading[id];
      if (!b) { failed[id] = 1; return null; }
      raw[id] = b;
      return b;
    }).catch(() => { failed[id] = 1; delete loading[id]; return null; });
  }

  function decodeId(id) {
    if (!id || failed[id]) return Promise.resolve(null);
    if (clips[id]) return Promise.resolve(clips[id]);
    if (decoding[id]) return decoding[id];
    return decoding[id] = fetchRaw(id).then(bytes => {
      if (!bytes) return null;
      return ensureCtx().then(c => {
        if (!c) return null;
        return c.decodeAudioData(bytes.slice(0)).then(buf => {
          clips[id] = buf; return buf;
        }).catch(() => { failed[id] = 1; return null; });
      });
    }).finally(() => { delete decoding[id]; });
  }

  // Prefetch wav bytes early; decode after first user gesture unlocks AudioContext.
  ALL_IDS.forEach(id => fetchRaw(id));

  function playBuf(buf, gain, dest) {
    const src = actx.createBufferSource(); src.buffer = buf;
    const g = actx.createGain(); g.gain.value = gain;
    src.connect(g).connect(dest || master); src.start();
    return src;
  }

  function playClip(id, ui) {
    return decodeId(id).then(buf => {
      if (!buf || !sfxOn()) return false;
      return ensureCtx().then(c => {
        if (!c || !sfxOn()) return false;
        playBuf(buf, ui ? UI_GAIN : SFX_GAIN);
        return true;
      });
    }).catch(() => false);
  }

  function sfx(name) {
    if (!sfxOn()) return;
    const ui = name === 'click' || name === 'back';
    const map = ORIG[name];
    const ids = map == null ? [] : (Array.isArray(map) ? map : [map]);
    ensureCtx().then(c => {
      if (!c || !sfxOn()) return;
      if (!ids.length) {
        if (bank[name]) bank[name](c.currentTime);
        return;
      }
      let i = 0;
      const next = () => {
        if (i >= ids.length || !sfxOn()) return;
        const id = ids[i++];
        playClip(id, ui).then(ok => {
          if (!ok && i === 1 && bank[name]) bank[name](c.currentTime);
          if (i < ids.length) setTimeout(next, 200);
        });
      };
      next();
    });
  }

  // --- BGM -----------------------------------------------------------------
  const BGM = {
    menu: ['bgm/menu.ogg', 'bgm/bgm001.wav'],
    duel: ['bgm/duel.ogg', 'bgm/bgm001.wav'],
    tense: ['bgm/tense.ogg', 'bgm/duel.ogg', 'bgm/bgm001.wav'],
    epic: ['bgm/epic.ogg', 'bgm/duel.ogg', 'bgm/bgm001.wav']
  };
  const bgmBuf = {}, bgmLoading = {};

  function loadBgmUrl(url) {
    if (bgmBuf[url] && bgmBuf[url].getChannelData) return Promise.resolve(bgmBuf[url]);
    if (bgmBuf[url] === false) return Promise.resolve(null);
    if (bgmLoading[url]) return bgmLoading[url];
    return bgmLoading[url] = fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(b => {
      delete bgmLoading[url];
      if (!b) { bgmBuf[url] = false; return null; }
      return ensureCtx().then(c => {
        if (!c) return null;
        return c.decodeAudioData(b.slice(0)).then(buf => { bgmBuf[url] = buf; return buf; }).catch(() => { bgmBuf[url] = false; return null; });
      });
    }).catch(() => { bgmBuf[url] = false; delete bgmLoading[url]; return null; });
  }

  async function playBgm(id) {
    if (!musicOn()) return;
    if (bgmId === id && bgmSrc) return;
    stopBgm(false);
    bgmId = id;
    const c = await ensureCtx();
    if (!c || bgmId !== id || !musicOn()) return;
    const urls = BGM[id] || BGM.duel;
    let buf = null;
    for (const u of urls) { buf = await loadBgmUrl(u); if (buf) break; }
    if (!buf || bgmId !== id || !musicOn()) return;
    try {
      bgmSrc = actx.createBufferSource();
      bgmSrc.buffer = buf; bgmSrc.loop = true;
      bgmSrc.connect(musicGain);
      musicGain.gain.cancelScheduledValues(actx.currentTime);
      musicGain.gain.setValueAtTime(0.001, actx.currentTime);
      musicGain.gain.exponentialRampToValueAtTime(.45, actx.currentTime + .8);
      bgmSrc.start();
      bgmSrc.onended = () => { if (bgmSrc) bgmSrc = null; };
    } catch (e) { bgmSrc = null; }
  }

  function stopBgm(fade) {
    const src = bgmSrc; bgmSrc = null; bgmId = null;
    if (!src || !actx) return;
    try {
      if (fade !== false && musicGain) {
        musicGain.gain.cancelScheduledValues(actx.currentTime);
        musicGain.gain.setValueAtTime(Math.max(.001, musicGain.gain.value), actx.currentTime);
        musicGain.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .4);
        setTimeout(() => { try { src.stop(); } catch (e) {} }, 450);
      } else src.stop();
    } catch (e) {}
  }

  window.sfx = sfx;
  window.bgm = { play: playBgm, stop: stopBgm, id: () => bgmId };
  const STATUS = { poison: 1, bad_poison: 1, burn: 1, paralyze: 1, sleep: 1, freeze: 1, melt: 1, panic: 1, curse: 1 };
  window.mpSfx = change => { if (change) sfx(change > 0 ? 'mp_up' : 'mp_down'); };
  window.statusSfx = kind => sfx(STATUS[kind] ? 'st_' + kind : 'st_other');

  const LABELS = { all: 'music + sfx', sfx: 'sfx', off: 'off' };
  const draw = () => {
    const b = document.getElementById('soundBtn'); if (!b) return; b.classList.add('iconbtn');
    const speaker = '<path d="M4 9v6h4l5 4V5L8 9H4z"/>';
    const glyph = mode === 'all' ? speaker + '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'
      : mode === 'sfx' ? speaker + '<path d="M16 10.5a2.5 2.5 0 0 1 0 3"/>'
      : speaker + '<path d="M16 9l5 6M21 9l-5 6"/>';
    b.innerHTML = icon(glyph);
    b.title = 'Sound: ' + LABELS[mode]; b.setAttribute('aria-label', b.title);
  };
  addEventListener('DOMContentLoaded', () => {
    draw();
    const b = document.getElementById('soundBtn');
    if (b) b.onclick = () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      persist();
      if (!musicOn()) stopBgm(false);
      draw();
      if (sfxOn()) {
        ensureCtx().then(() => {
          sfx('click');
          if (musicOn()) {
            const onGame = document.getElementById('game') && !document.getElementById('game').hidden;
            bgm.play(onGame ? 'duel' : 'menu');
          }
        });
      }
    };
  });
  // Unlock AudioContext on first gesture, then allow pending decode/play.
  addEventListener('pointerdown', () => { ensureCtx(); }, true);
  addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('button, [role="button"], a, summary, .row, .tcard, .pchip');
    if (!el || el.disabled || el.id === 'soundBtn' || el.closest('#nav') || el.getAttribute('aria-disabled') === 'true') return;
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    sfx(/^(close|back)\b/i.test(label) || el.classList.contains('x') ? 'back' : 'click');
  }, true);
})();
