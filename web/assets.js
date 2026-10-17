// Asset gate: on open, let the visitor pick which packs to download & cache
// (rule engine, emulator, SFX, music). Cache API + service worker serve them later;
// libTFG.so is also stored in IndexedDB for the existing engine loader.
(() => {
  const CACHE = 'pdw-assets-v1';
  const META_KEY = 'pokemonduelweb.assetPacks';
  const IDB_NAME = 'pokemon-duel-web';
  const CONCUR = 4;
  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

  const SFX_IDS = ['jingle001','jingle002','se001','se002','se003','se004','se005','se006','se009','se010','se011','se012','se013','se014','se017','se017_2','se022','se023','se024','se026','se027','se028','se029','se030','se034','se035','se036_1','se036_1shot','se037','se038','se039','se042','se043','se044','se045','se046','se047','se048','se051','se052','se053','se054','se055','se057','se058','se059','se060','se061','se063','se064','se065','se066','se067','se070','se071','se072','se073','se074','se075','se076','se077','se078','se079','se080','se081','se082','se083','se084','se085','se086','se087','se088','se089','se090','se091','se092','se093','se094','se114','se116','se121','se122','se123','se124','se125','se129','se130','se132','se133','se134','se135','se136','se137','se138','se139','se140','se141','se142','se147','se148','se149','se152','se153','se154','se156','se157','se158','se160','se165','se166','se169','se170','se171','se172','se173','se174','se175','se176','se177','se178','se179','se180','se181','se182','se183','se184','se185','se186','se187','se188','se189','se190','se191','se192','se193','se194','se198','se203','se205','se206','se207','se208','se209','se210','se211','se212','se213','se214','se215','se216','se217','se218','se219','se221','se222','se223','se223_2','se224','se226','se227','se229','se230','se231','se233','se235','se238'];

  const PACKS = {
    engine: {
      label: 'Rule engine',
      note: 'libTFG.so — required to play duels',
      size: '3.7 MB',
      files: ['libTFG.so'],
      idbLib: true,
      defaultOn: true
    },
    emulator: {
      label: 'Emulator',
      note: 'Unicorn ARM worker that runs the engine',
      size: '0.8 MB',
      files: ['vendor/unicorn_arm.js', 'tfg.js', 'engine-worker.js'],
      defaultOn: true
    },
    sfx: {
      label: 'Sound effects',
      note: 'UI clicks, spins, hits, statuses, jingles',
      size: '71 MB',
      files: SFX_IDS.map(id => 'sfx/' + id + '.wav'),
      defaultOn: true,
      unlockAudio: true
    },
    bgm: {
      label: 'Music',
      note: 'Menu and duel background tracks',
      size: '9 MB',
      files: ['bgm/bgm001.wav', 'bgm/menu.ogg', 'bgm/duel.ogg', 'bgm/tense.ogg', 'bgm/epic.ogg'],
      defaultOn: true,
      unlockAudio: true
    }
  };

  let armed = false, silenceEl = null;
  const readyWaiters = [];
  const href = path => new URL(path, document.baseURI || location.href).href;

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }

  function idbPutLib(bytes) {
    return new Promise((ok, bad) => {
      const o = indexedDB.open(IDB_NAME, 1);
      o.onupgradeneeded = () => o.result.createObjectStore('kv');
      o.onerror = () => bad(o.error);
      o.onsuccess = () => {
        const r = o.result.transaction('kv', 'readwrite').objectStore('kv').put(bytes, 'lib');
        r.onsuccess = () => ok();
        r.onerror = () => bad(r.error);
      };
    });
  }

  async function openCache() {
    if (!('caches' in window)) return null;
    return caches.open(CACHE);
  }

  async function packProgress(id) {
    const pack = PACKS[id], cache = await openCache();
    if (!cache) return { have: 0, total: pack.files.length, done: false };
    let have = 0;
    for (const f of pack.files) {
      if (await cache.match(href(f))) have++;
    }
    return { have, total: pack.files.length, done: have >= pack.files.length };
  }

  async function getBuffer(path) {
    const cache = await openCache();
    if (cache) {
      const hit = await cache.match(href(path));
      if (hit) return hit.arrayBuffer();
    }
    const r = await fetch(href(path));
    if (!r.ok) return null;
    return r.arrayBuffer();
  }

  async function mediaUrl(path) {
    const cache = await openCache();
    if (cache) {
      const hit = await cache.match(href(path));
      if (hit) {
        const blob = await hit.blob();
        return URL.createObjectURL(blob);
      }
    }
    return href(path);
  }

  function setPlaybackSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  }

  function primeAudio() {
    setPlaybackSession();
    try {
      if (!silenceEl) {
        silenceEl = new Audio(SILENT_WAV);
        silenceEl.loop = true;
        silenceEl.volume = 0.01;
        silenceEl.setAttribute('playsinline', '');
        silenceEl.playsInline = true;
        silenceEl.setAttribute('x-webkit-airplay', 'deny');
      }
      return silenceEl.play().catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }

  async function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI || location.href), { scope: new URL('.', document.baseURI || location.href).pathname });
      await navigator.serviceWorker.ready.catch(() => {});
      return reg;
    } catch (e) {}
  }

  function mapPool(items, limit, fn) {
    let i = 0, active = 0, done = 0;
    return new Promise((resolve, reject) => {
      const kick = () => {
        if (done >= items.length && active === 0) return resolve();
        while (active < limit && i < items.length) {
          const item = items[i++];
          active++;
          Promise.resolve(fn(item)).then(() => {
            active--; done++; kick();
          }, err => reject(err));
        }
      };
      if (!items.length) resolve();
      else kick();
    });
  }

  async function downloadPack(id, onFile) {
    const pack = PACKS[id], cache = await openCache();
    if (!cache) throw new Error('This browser cannot cache files offline.');
    let done = 0;
    await mapPool(pack.files, CONCUR, async file => {
      const url = href(file);
      let hit = await cache.match(url);
      if (!hit) {
        const r = await fetch(url).catch(() => null);
        if (!r || !r.ok) throw new Error('Failed: ' + file);
        await cache.put(url, r.clone());
        hit = r;
      }
      if (pack.idbLib && file === 'libTFG.so') {
        try {
          const bytes = await hit.clone().arrayBuffer();
          if (bytes.byteLength > 100000) await idbPutLib(bytes);
        } catch (e) {}
      }
      done++;
      if (onFile) onFile(done, pack.files.length, file);
    });
    const meta = loadMeta();
    meta[id] = { ver: CACHE, at: Date.now(), n: pack.files.length };
    saveMeta(meta);
  }

  function markArmed() {
    armed = true;
    while (readyWaiters.length) {
      try { readyWaiters.shift()(); } catch (e) {}
    }
    try { dispatchEvent(new CustomEvent('pdw-assets-ready')); } catch (e) {}
  }

  function whenReady(fn) {
    if (armed) fn();
    else readyWaiters.push(fn);
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  async function showGate() {
    if (document.getElementById('assetGate')) return;
    const host = document.body || document.documentElement;
    const statuses = {};
    await Promise.all(Object.keys(PACKS).map(async id => { statuses[id] = await packProgress(id); }));

    const allDone = Object.keys(PACKS).every(id => statuses[id].done);
    const root = el(`<div id="assetGate" role="dialog" aria-modal="true" aria-labelledby="agTitle">
      <div class="ag-box">
        <h2 id="agTitle">${allDone ? 'Enable assets' : 'Download assets'}</h2>
        <p>${allDone
          ? 'Packs are cached on this device. Tap continue to unlock sound and start.'
          : 'Choose what to keep on this device so play does not stall on first use. Long-press the sound button later to open this again.'}</p>
        <div class="ag-packs" id="agPacks"></div>
        <div class="ag-bar" hidden id="agBar"><i id="agFill"></i></div>
        <p class="ag-meta" id="agMeta"></p>
        <div class="ag-actions">
          <button type="button" class="primary" id="agGo">${allDone ? 'Continue' : 'Download & continue'}</button>
          <button type="button" class="linkish" id="agSkip">Continue without downloading</button>
        </div>
      </div>
    </div>`);
    host.appendChild(root);
    const packsEl = root.querySelector('#agPacks');
    const metaEl = root.querySelector('#agMeta');
    const bar = root.querySelector('#agBar');
    const fill = root.querySelector('#agFill');
    const go = root.querySelector('#agGo');
    const skip = root.querySelector('#agSkip');

    for (const id of Object.keys(PACKS)) {
      const p = PACKS[id], st = statuses[id];
      const checked = p.defaultOn || st.done;
      const row = el(`<label class="ag-pack${st.done ? ' ready' : ''}">
        <input type="checkbox" data-pack="${id}" ${checked ? 'checked' : ''}>
        <span class="ag-pack-body">
          <b>${p.label} <em>${p.size}</em></b>
          <span>${p.note}</span>
          <span class="ag-pack-st" data-st="${id}">${st.done ? 'Cached' : st.have ? (st.have + ' / ' + st.total) : 'Not cached'}</span>
        </span>
      </label>`);
      packsEl.appendChild(row);
    }

    const close = () => { root.remove(); markArmed(); };

    skip.onclick = () => { primeAudio(); close(); };

    go.onclick = async () => {
      const selected = [...root.querySelectorAll('input[data-pack]:checked')].map(i => i.dataset.pack);
      go.disabled = true; skip.disabled = true;
      root.querySelectorAll('input[data-pack]').forEach(i => { i.disabled = true; });
      if (selected.some(id => PACKS[id].unlockAudio)) await primeAudio();
      else await primeAudio();

      try {
        await registerSw();
        const todo = [];
        for (const id of selected) {
          const st = await packProgress(id);
          if (!st.done) todo.push(id);
        }
        if (!todo.length) {
          metaEl.textContent = 'Ready.';
          close();
          if (window.bgm && window.bgm.play) {
            const onGame = document.getElementById('game') && !document.getElementById('game').hidden;
            try { window.bgm.play(onGame ? 'duel' : 'menu'); } catch (e) {}
          }
          if (window.sfx) try { window.sfx('click'); } catch (e) {}
          return;
        }

        bar.hidden = false;
        let fileDone = 0, fileTotal = todo.reduce((n, id) => n + PACKS[id].files.length, 0);
        // subtract already-cached files from total for nicer progress
        for (const id of todo) {
          const st = await packProgress(id);
          fileTotal -= st.have;
          fileDone += 0;
        }
        if (fileTotal < 1) fileTotal = 1;
        let completed = 0;
        for (const id of todo) {
          const stEl = root.querySelector(`[data-st="${id}"]`);
          if (stEl) stEl.textContent = 'Downloading…';
          await downloadPack(id, (have, total, file) => {
            completed++;
            const pct = Math.min(100, Math.round((completed / (todo.reduce((n, x) => n + PACKS[x].files.length, 0))) * 100));
            fill.style.width = pct + '%';
            metaEl.textContent = PACKS[id].label + ': ' + have + ' / ' + total;
            if (stEl) stEl.textContent = have + ' / ' + total;
          });
          if (stEl) stEl.textContent = 'Cached';
          const lab = root.querySelector(`input[data-pack="${id}"]`)?.closest('.ag-pack');
          if (lab) lab.classList.add('ready');
        }
        fill.style.width = '100%';
        metaEl.textContent = 'All selected packs cached.';
        close();
        if (window.sfx) try { window.sfx('click'); } catch (e) {}
        if (window.bgm && window.bgm.play) {
          const onGame = document.getElementById('game') && !document.getElementById('game').hidden;
          try { window.bgm.play(onGame ? 'duel' : 'menu'); } catch (e) {}
        }
      } catch (err) {
        metaEl.textContent = (err && err.message) || 'Download failed.';
        go.disabled = false; skip.disabled = false;
        root.querySelectorAll('input[data-pack]').forEach(i => { i.disabled = false; });
      }
    };
  }

  // Long-press sound button re-opens the gate.
  function bindReopen() {
    for (const b of document.querySelectorAll('[data-sound-btn], #soundBtn')) {
      if (b._assetBound) continue;
      b._assetBound = 1;
      let t = 0;
      const start = () => { t = setTimeout(() => { showGate(); }, 650); };
      const clear = () => clearTimeout(t);
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', clear);
      b.addEventListener('pointerleave', clear);
      b.addEventListener('pointercancel', clear);
    }
  }

  window.Assets = {
    CACHE, PACKS, href, mediaUrl, getBuffer, packProgress, whenReady,
    isArmed: () => armed,
    primeAudio, showGate, registerSw
  };

  registerSw();
  const boot = () => { showGate(); bindReopen(); };
  if (document.body) boot();
  else addEventListener('DOMContentLoaded', boot);
  addEventListener('DOMContentLoaded', () => setTimeout(bindReopen, 0));
})();
