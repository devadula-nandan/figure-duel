// Theme for every page: Auto follows the device's light / dark setting; the choice is remembered on this device.
// Loaded in <head> so the page is drawn in the right theme from the first frame. A button with id "themeBtn" cycles Auto -> Light -> Dark.
(() => {
  const KEY = 'pokemonduelweb.theme', sysLight = matchMedia('(prefers-color-scheme: light)'); let mode = 'auto';
  // Small line icons drawn here (no icon font or image files). icon() is shared with the pages for their own buttons.
  window.icon = body => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const ICONS = { auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' };
  // The button shows what a click would switch to: that theme's icon, drawn in that theme's own colours (Auto takes the device's).
  const NEXT = { auto: 'light', light: 'dark', dark: 'auto' }, LOOK = { light: ['#fff', '#111', '#cfcfcf'], dark: ['#111', '#f2f2f2', '#333'] };
  const label = () => { const b = document.getElementById('themeBtn'); if (!b) return; const next = NEXT[mode], [bg, ink, line] = LOOK[next === 'auto' ? (sysLight.matches ? 'light' : 'dark') : next];
    b.innerHTML = icon(ICONS[next]); b.title = 'Switch to ' + next + ' theme (now: ' + mode + ')'; b.setAttribute('aria-label', b.title); b.classList.add('iconbtn'); Object.assign(b.style, { background: bg, color: ink, borderColor: line }); };
  window.setTheme = m => { mode = ['auto', 'light', 'dark'].includes(m) ? m : 'auto'; document.documentElement.dataset.theme = mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : mode; label(); try { localStorage.setItem(KEY, mode); } catch (e) {} };
  window.themeMode = () => mode;
  let saved = 'auto'; try { saved = localStorage.getItem(KEY); if (saved == null) { const old = localStorage.getItem('figureduel.theme'); if (old != null) { saved = old; localStorage.setItem(KEY, old); localStorage.removeItem('figureduel.theme'); } } saved = saved || 'auto'; } catch (e) {} setTheme(saved);
  sysLight.addEventListener('change', () => { if (mode === 'auto') setTheme('auto'); else label(); });
  addEventListener('DOMContentLoaded', () => { label(); const b = document.getElementById('themeBtn'); if (b) b.onclick = () => setTheme(NEXT[mode]); });
})();
