// Game entry point. Wires input -> Game -> Renderer and drives the RAF loop.
// HUD is driven by a tiny pub-sub on the Game's per-frame events plus direct
// reads of score/lives/distance.
import { Game } from '../core/game.js';
import { Renderer } from '../render/renderer.js';
import { Sound } from '../audio/sound.js';
import { setLang, nextLang, getLang, t } from '../i18n.js';

const canvas = document.getElementById('game');
const ui = {
  score: document.getElementById('score'),
  lives: document.getElementById('lives'),
  distance: document.getElementById('distance'),
  collected: document.getElementById('collected'),
  best: document.getElementById('best-val'),
  hitFlash: document.getElementById('hit-flash'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayText: document.getElementById('overlay-text'),
  legend: document.getElementById('legend'),
  primaryBtn: document.getElementById('primary-btn'),
  hint: document.getElementById('hint'),
  pauseBtn: document.getElementById('pause-btn'),
  muteBtn: document.getElementById('mute-btn'),
  langBtn: document.getElementById('lang-btn'),
  menuLangBtn: document.getElementById('menu-lang-btn'),
};

// Dev/test URL flags (see README + MCP testing notes):
//   ?dev=inf  → infinite lives (stable in-motion screenshots, game never ends)
//   ?mute=1   → force sound OFF on load (MCP / automated browser tests)
// Recommended MCP test URL: http://127.0.0.1:8000/?dev=inf&mute=1
const QUERY = new URLSearchParams(location.search);
const DEV = QUERY.get('dev');
const FORCE_MUTE = QUERY.get('mute') === '1';
const game = new Game({
  seed: (Math.random() * 1e9) | 0,
  infiniteLives: DEV === 'inf',
});
const renderer = new Renderer(canvas);

// Best score persistence
const BEST_KEY = 'airraid_best';
const MUTE_KEY = 'airraid_muted';

// Procedural sound (Web Audio, no assets). Lazy — unlocks on first gesture.
// ?mute=1 overrides the stored preference so automated tests stay silent.
const sound = new Sound({
  muted: FORCE_MUTE || localStorage.getItem(MUTE_KEY) === '1',
});

// Expose handles for automated e2e tests (Playwright). Harmless in normal use.
if (typeof window !== 'undefined') {
  window.__game = game;
  window.__renderer = renderer;
  window.__sound = sound;
}

function getBest() {
  return Number(localStorage.getItem(BEST_KEY) || 0);
}
function setBest(v) {
  localStorage.setItem(BEST_KEY, String(v));
}

function hearts(n) {
  return '❤'.repeat(n) + '♡'.repeat(Math.max(0, 3 - n));
}

function showOverlay(state) {
  if (state === 'menu') {
    ui.overlayTitle.textContent = t('menu_title');
    ui.overlayText.innerHTML = t('menu_text');
    ui.primaryBtn.textContent = t('menu_btn');
    ui.primaryBtn.dataset.action = 'start';
    ui.legend.hidden = false;
    ui.overlay.classList.remove('hidden');
    ui.hint.textContent = t('menu_hint');
  } else if (state === 'paused') {
    ui.legend.hidden = true;
    ui.overlayTitle.textContent = t('pause_title');
    ui.overlayText.innerHTML = t('pause_text', {
      n: Math.round(game.distance),
      u: t('unit_m'),
      s: game.score,
    });
    ui.primaryBtn.textContent = t('pause_overlay_btn');
    ui.primaryBtn.dataset.action = 'resume';
    ui.overlay.classList.remove('hidden');
    ui.hint.textContent = t('pause_hint');
  } else if (state === 'gameover') {
    ui.overlayTitle.textContent = t('over_title');
    const sc = game.score;
    const best = Math.max(getBest(), sc);
    if (sc >= best) setBest(sc);
    ui.overlayText.innerHTML = t('over_text', {
      n: Math.round(game.distance),
      u: t('unit_m'),
      s: sc,
      b: best,
    });
    ui.legend.hidden = true;
    ui.primaryBtn.textContent = t('over_btn');
    ui.primaryBtn.dataset.action = 'restart';
    ui.overlay.classList.remove('hidden');
    ui.hint.textContent = t('over_hint');
  } else {
    ui.overlay.classList.add('hidden');
  }
}

function refreshHud() {
  ui.score.textContent = game.score;
  ui.lives.textContent = hearts(game.lives);
  ui.distance.textContent = Math.round(game.distance) + ' ' + t('unit_m');
  const counts = {};
  for (const c of game.collected) counts[c] = (counts[c] || 0) + 1;
  const parts = [];
  if (counts.phone) parts.push('📱' + (counts.phone > 1 ? '×' + counts.phone : ''));
  if (counts.flashlight) parts.push('🔦' + (counts.flashlight > 1 ? '×' + counts.flashlight : ''));
  if (counts.water) parts.push('💧' + (counts.water > 1 ? '×' + counts.water : ''));
  if (counts.firstaid) parts.push('✚' + (counts.firstaid > 1 ? '×' + counts.firstaid : ''));
  ui.collected.textContent = parts.length ? parts.join(' ') : '';
  ui.best.textContent = getBest();
}

function doAction(action) {
  if (action === 'start') {
    sound.unlock();
    sound.duck(1);
    sound.startSiren();
    game.start();
  } else if (action === 'resume') {
    sound.unlock();
    sound.duck(1);
    game.pause(); // paused -> running
  } else if (action === 'restart') {
    sound.unlock();
    sound.duck(1);
    sound.startSiren();
    game.reset((Math.random() * 1e9) | 0);
    game.start();
  }
  ui._lastShown = game.state;
  showOverlay(game.state);
}

function togglePause() {
  if (game.state === 'running' || game.state === 'paused') {
    game.pause(); // running -> paused -> running
    sound.duck(game.state === 'paused' ? 0.2 : 1);
    // Keep the overlay in sync: resume must hide the "Paused" panel, and
    // pause must show it — independent of the loop's transition block.
    ui._lastShown = game.state;
    showOverlay(game.state);
  }
  syncPauseBtn();
}

function toggleMute() {
  const m = !sound.muted;
  sound.setMuted(m);
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  syncMuteBtn();
}

function syncPauseBtn() {
  const active = game.state === 'running' || game.state === 'paused';
  ui.pauseBtn.disabled = !active;
  ui.pauseBtn.textContent = game.state === 'paused' ? t('resume_btn') : t('pause_btn');
}

function syncMuteBtn() {
  ui.muteBtn.textContent = sound.muted ? '🔇' : '🔊';
  ui.muteBtn.setAttribute('aria-pressed', String(sound.muted));
}

// --- i18n ---
// Re-translate every static piece of UI that carries a data-i18n /
// data-i18n-aria hook, set the <html lang> attribute, and update the language
// button (it shows the language you'd switch TO, so a UK reader sees "EN").
function applyStaticI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  ui.langBtn.textContent = nextLang() === 'uk' ? 'UK' : 'EN';
  if (ui.menuLangBtn) ui.menuLangBtn.textContent = nextLang() === 'uk' ? 'UK' : 'EN';
}

function toggleLang() {
  setLang(nextLang());
  applyStaticI18n();
  // Re-render the dynamic strings (HUD unit, pause label, overlay text) for
  // the newly selected language.
  refreshHud();
  syncPauseBtn();
  showOverlay(game.state);
  // Re-bake the shelter-sign textures with the new language's word
  // (disposes the old textures first, so no GPU memory leaks).
  renderer.track.refreshSigns();
}

function move(dir) {
  if (game.state !== 'running') return;
  if (game.move(dir)) sound.play('move');
}

function doJump() {
  if (game.state !== 'running') return;
  if (game.jump()) sound.play('jump');
}

function doCrouch() {
  if (game.state !== 'running') return;
  game.crouch(); // holding the key re-arms this every frame → crouch lasts
  sound.play('crouch');
}

// --- Input ---
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') move(-1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') move(1);
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
    e.preventDefault();
    doJump();
  } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
    e.preventDefault();
    doCrouch();
  } else if (k === ' ' || k === 'Spacebar') {
    e.preventDefault();
    if (game.state === 'menu') doAction('start');
    else if (game.state === 'gameover') doAction('restart');
  } else if (k === 'Escape' || k === 'p' || k === 'P') {
    togglePause();
  } else if (k === 'm' || k === 'M') {
    toggleMute();
  } else if (k === 'r' || k === 'R') {
    if (game.state !== 'running' && game.state !== 'paused') doAction('restart');
  }
});

// Auto-pause when the tab is hidden (prevents huge dt gaps + keeps the siren
// from screaming over other audio).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'running') {
    game.pause();
    sound.duck(0.2);
    sound.duckDrone(0.2);
    syncPauseBtn();
  }
});

// touch / swipe
let touchStartX = null;
window.addEventListener('touchstart', (e) => {
  sound.unlock(); // first user gesture on the page
  touchStartX = e.touches[0].clientX;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (touchStartX == null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
  else if (game.state !== 'running') doAction(game.state === 'menu' ? 'start' : 'restart');
  touchStartX = null;
});

ui.primaryBtn.addEventListener('click', () => doAction(ui.primaryBtn.dataset.action));
ui.pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePause();
});
ui.muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
});
ui.langBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleLang();
});
if (ui.menuLangBtn) ui.menuLangBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleLang();
});

// --- Main loop ---
let last = performance.now();
let raf;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'running') {
    game.step(dt);
    // SFX for this frame's events (renderer.sync consumes/clears them next).
    for (const ev of game.events) {
      if (ev.type === 'hit') sound.play('hit');
      else if (ev.type === 'collect') sound.play('collect', { item: ev.item });
      else if (ev.type === 'milestone') sound.play('milestone');
      else if (ev.type === 'debris_land') sound.play('debris_land');
    }
    // Shahed-style hum: on while any incoming drone is on screen.
    // startDrone()/stopDrone() are idempotent, so this is cheap per frame.
    if (game.objects.some((o) => o.type === 'drone')) sound.startDrone();
    else sound.stopDrone();
  }
  renderer.sync(game, dt, now / 1000);

  // HUD flash for hits
  const fl = renderer.flash;
  ui.hitFlash.style.opacity = fl > 0 ? fl * 0.5 : 0;

  refreshHud();
  syncPauseBtn();

  // React to state transitions (overlay + siren lifecycle)
  if (game.state !== ui._lastShown) {
    const prev = ui._lastShown;
    ui._lastShown = game.state;
    if (game.state === 'gameover' && prev !== 'gameover') {
      sound.stopSiren();
      sound.stopDrone();
      sound.play('gameover');
    }
    if (game.state === 'running' && prev !== 'running') {
      // resumed from pause or just started via keyboard/touch — make sure siren is on
      sound.duck(1);
      sound.startSiren();
      sound.duckDrone(1);
    }
    if (game.state === 'paused') {
      sound.duck(0.2);
      sound.duckDrone(0.2);
    }
    showOverlay(game.state); // hide on resume, show on pause/gameover
  }
  raf = requestAnimationFrame(loop);
}

applyStaticI18n(); // sets <html lang>, translates static labels, inits the lang button
showOverlay(game.state);
refreshHud();
syncPauseBtn();
syncMuteBtn();
raf = requestAnimationFrame(loop);
