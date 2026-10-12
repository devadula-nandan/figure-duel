// Sound effects for every page. Each one is a few oscillator tones made on the spot; there are no audio files.
// sfx(name) plays one; statusSfx(kind) plays the one for a status condition. A button with id "soundBtn" switches sound on and off,
// and the choice is remembered on this device. (Browsers only let a page make sound after the visitor has clicked or tapped it once.)
(() => {
  const SOUND_KEY = 'figureduel.sound'; let actx = null, soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
  function sfx(name) {
    if (!soundOn) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return; }
    const t = actx.currentTime, tone = (type, f0, f1, at, dur, vol) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + .01); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur); o.connect(g).connect(actx.destination); o.start(t + at); o.stop(t + at + dur + .02);
    };
    ({ select: () => tone('triangle', 660, 880, 0, .07, .12),
      step: () => { tone('sine', 300, 150, 0, .09, .25); tone('triangle', 900, 500, 0, .04, .06); },                      // a figure landing on a point
      spin: () => { for (let k = 0; k < 18; k++) tone('square', 1200, 900, 1.5 * Math.pow(k / 18, 1.8), .025, .05); },    // wheel ticks that slow down
      hit: () => { tone('sawtooth', 220, 60, 0, .22, .2); tone('square', 110, 40, 0, .3, .15); },
      win: () => [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, k * .12, .22, .16)),
      lose: () => [392, 330, 262, 196].forEach((f, k) => tone('triangle', f, f, k * .16, .28, .16)),
      turn: () => { tone('sine', 784, 784, 0, .1, .1); tone('sine', 1047, 1047, .1, .16, .1); },
      // status conditions: each is a few tones chosen to suggest it
      st_poison: () => [0, .09, .18].forEach((at, k) => tone('sine', 520 - k * 90, 300 - k * 60, at, .12, .16)),                                   // three bubbles sinking
      st_bad_poison: () => [0, .08, .16, .24].forEach((at, k) => tone('triangle', 420 - k * 70, 190 - k * 30, at, .14, .17)),                       // the same, lower and longer
      st_burn: () => { for (let k = 0; k < 9; k++) tone('sawtooth', 900 + (k * 331) % 700, 200 + (k * 97) % 150, k * .035, .05, .07); },            // crackle
      st_paralyze: () => { for (let k = 0; k < 8; k++) tone('square', k % 2 ? 1500 : 620, k % 2 ? 1400 : 600, k * .035, .03, .07); },               // a buzzing zap
      st_sleep: () => { tone('sine', 660, 520, 0, .32, .14); tone('sine', 494, 370, .3, .45, .13); },                                               // two notes drifting down
      st_freeze: () => { tone('sine', 2200, 2600, 0, .09, .1); tone('triangle', 3100, 1800, .06, .3, .08); tone('sine', 1500, 1480, .1, .5, .06); }, // a glassy ping that rings on
      st_melt: () => sfx('st_freeze'),
      st_panic: () => { for (let k = 0; k < 6; k++) tone('sine', k % 2 ? 760 : 540, k % 2 ? 540 : 760, k * .08, .08, .12); },                       // a wobble
      st_curse: () => { tone('sawtooth', 130, 70, 0, .6, .16); tone('sine', 196, 98, .05, .55, .12); },                                             // a low drone falling
      mp_up: () => [392, 523, 659].forEach((f, k) => tone('triangle', f, f * 1.02, k * .07, .12, .14)),      // three quick steps up
      mp_down: () => [523, 415, 311].forEach((f, k) => tone('triangle', f, f * .97, k * .08, .14, .14)),    // three steps down
      st_other: () => { tone('triangle', 500, 700, 0, .1, .12); tone('triangle', 700, 500, .1, .14, .1); } }[name] || (() => {}))();
  }
  window.sfx = sfx;
  const STATUS = { poison: 1, bad_poison: 1, burn: 1, paralyze: 1, sleep: 1, freeze: 1, melt: 1, panic: 1, curse: 1 };
  window.mpSfx = change => { if (change) sfx(change > 0 ? 'mp_up' : 'mp_down'); };
  window.statusSfx = kind => sfx(STATUS[kind] ? 'st_' + kind : 'st_other');
  const draw = () => { const b = document.getElementById('soundBtn'); if (!b) return; b.classList.add('iconbtn');
    b.innerHTML = icon('<path d="M4 9v6h4l5 4V5L8 9H4z"/>' + (soundOn ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M16 9l5 6M21 9l-5 6"/>')); b.title = 'Sound: ' + (soundOn ? 'on' : 'off'); b.setAttribute('aria-label', b.title); };
  addEventListener('DOMContentLoaded', () => { draw(); const b = document.getElementById('soundBtn'); if (b) b.onclick = () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {} draw(); sfx('select'); }; });
})();
