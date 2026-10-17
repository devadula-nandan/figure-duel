// Theme for every page: Auto follows the device's light / dark setting; the choice is remembered on this device.
// Loaded in <head> so the page is drawn in the right theme from the first frame.
// Buttons with data-theme-btn (or id themeBtn) cycle Auto -> Light -> Dark.
// data-update-btn appears when a newer GitHub release tag exists than APP_VER; click hard-reloads.
(() => {
  const KEY = 'pokemonduelweb.theme', sysLight = matchMedia('(prefers-color-scheme: light)'); let mode = 'auto';
  const REPO = 'devadula-nandan/pokemon-duel-web';
  // Bump when shipping a build — must match the GitHub release tag (vX.Y.Z).
  window.APP_VER = '0.4.0';
  // Small line icons drawn here (no icon font or image files). icon() is shared with the pages for their own buttons.
  window.icon = body => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const mountVer = () => {
    if (document.getElementById('appVer')) return;
    const el = document.createElement('div');
    el.id = 'appVer'; el.className = 'appver'; el.setAttribute('aria-hidden', 'true');
    el.textContent = 'v' + window.APP_VER;
    (document.body || document.documentElement).appendChild(el);
  };
  if (document.body) mountVer(); else addEventListener('DOMContentLoaded', mountVer);
  const ICONS = { auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' };
  const UPDATE_ICON = '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="M12 8v4l2.5 1.5"/>';
  // The button shows the current selection (Auto / Light / Dark); click cycles to the next.
  const NEXT = { auto: 'light', light: 'dark', dark: 'auto' }, LOOK = { light: ['#fff', '#111', '#cfcfcf'], dark: ['#111', '#f2f2f2', '#333'] };
  const themeBtns = () => {
    const seen = new Set(), out = [];
    for (const b of document.querySelectorAll('[data-theme-btn], #themeBtn')) { if (seen.has(b)) continue; seen.add(b); out.push(b); }
    return out;
  };
  const label = () => {
    const look = mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : mode;
    const [bg, ink, line] = LOOK[look];
    const title = 'Theme: ' + mode + (mode === 'auto' ? ' (follows device)' : '') + ' — click for ' + NEXT[mode];
    for (const b of themeBtns()) {
      b.innerHTML = icon(ICONS[mode]); b.title = title; b.setAttribute('aria-label', title); b.classList.add('iconbtn');
      Object.assign(b.style, { background: bg, color: ink, borderColor: line });
      if (!b._themeBound) { b._themeBound = 1; b.onclick = () => setTheme(NEXT[mode]); }
    }
  };
  window.setTheme = m => { mode = ['auto', 'light', 'dark'].includes(m) ? m : 'auto'; document.documentElement.dataset.theme = mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : mode; label(); try { localStorage.setItem(KEY, mode); } catch (e) {} };
  window.themeMode = () => mode;
  let saved = 'auto'; try { saved = localStorage.getItem(KEY); if (saved == null) { const old = localStorage.getItem('figureduel.theme'); if (old != null) { saved = old; localStorage.setItem(KEY, old); localStorage.removeItem('figureduel.theme'); } } saved = saved || 'auto'; } catch (e) {} setTheme(saved);
  sysLight.addEventListener('change', () => { if (mode === 'auto') setTheme('auto'); else label(); });
  addEventListener('DOMContentLoaded', () => label());

  // --- Update check (GitHub Releases) ------------------------------------
  const parts = v => String(v || '').replace(/^v/i, '').split(/[.+-]/).map(x => { const n = parseInt(x, 10); return Number.isFinite(n) ? n : 0; });
  const isNewer = (remote, local) => {
    const a = parts(remote), b = parts(local), n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0; }
    return false;
  };
  async function hardReload() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {}
    const u = new URL(location.href);
    u.searchParams.set('_', String(Date.now()));
    location.replace(u.href);
  }
  function paintUpdate(remote) {
    const title = 'Update to v' + remote + ' (you have v' + window.APP_VER + ') — tap to reload';
    for (const b of document.querySelectorAll('[data-update-btn], #updateBtn')) {
      b.hidden = false;
      b.classList.add('iconbtn', 'updatebtn');
      b.innerHTML = icon(UPDATE_ICON);
      b.title = title;
      b.setAttribute('aria-label', title);
      if (!b._updateBound) { b._updateBound = 1; b.onclick = () => { hardReload(); }; }
    }
  }
  async function checkRelease() {
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!r.ok) return;
      const data = await r.json();
      const tag = (data.tag_name || '').replace(/^v/i, '');
      if (tag && isNewer(tag, window.APP_VER)) paintUpdate(tag);
    } catch (e) {}
  }
  if (document.body) checkRelease();
  else addEventListener('DOMContentLoaded', checkRelease);
})();
