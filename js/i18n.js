// ---------------------------------------------------------------------------
// i18n — tiny, dependency-free i18n for the UI (no bundler).
//
// Languages: English (default) + Ukrainian. Detection order:
//   1. the user's explicit choice, persisted in localStorage (STORAGE_KEY);
//   2. the browser language — Ukrainian ("uk…") → uk, everything else → en.
//
// This module only holds strings + detection. main.js does all the DOM
// rendering (it imports `t` and re-applies the UI whenever the language
// changes, see `applyAll()` there).
// ---------------------------------------------------------------------------

export const SUPPORTED = ['en', 'uk'];

/** localStorage key where the user's chosen language is persisted. */
export const STORAGE_KEY = 'airraid_lang';

const STRINGS = {
  en: {
    // HUD
    hud_score: 'Score',
    hud_lives: 'Lives',
    hud_distance: 'Distance',
    best: 'Best',
    unit_m: 'm',
    swipe_hint: 'Swipe \u2190 \u2192 to change lanes \u00b7 tap \u23f8 to pause',
    pause_btn: '\u23f8 Pause',
    resume_btn: '\u25b6 Resume',
    pause_aria: 'Pause or resume (Esc)',
    mute_aria: 'Toggle sound (M)',
    lang_aria: 'Switch language',
    sign_word: 'SHELTER',

    // Menu / pause / game-over overlay
    menu_title: 'Air Raid Runner',
    menu_text:
      'The air-raid siren is howling. You must reach the nearest shelter before ' +
      'the shelling starts. Dodge debris and wrecks, grab essentials, follow the ' +
      'green SHELTER signs.',
    menu_btn: 'Start running (Space)',
    menu_hint:
      '\u2190 \u2192 or A/D switch lanes \u00b7 \u2191/W jump (debris, barricades \u2014 not cars) \u00b7 ' +
      '\u2193/S duck under drones \u00b7 Esc pause',
    pause_title: 'Paused',
    pause_text:
      'You have run <b>{n} {u}</b> \u00b7 score <b>{s}</b>.<br>' +
      'The siren keeps wailing. Breathe, then get back out there.',
    pause_overlay_btn: 'Resume (Esc)',
    pause_hint: 'Esc or P to resume \u00b7 M to mute',
    over_title: 'You were caught in the open',
    over_text:
      'You ran <b>{n} {u}</b> and scored <b>{s}</b>.<br>Best: <b>{b}</b>',
    over_btn: 'Try again (R)',
    over_hint: 'Every meter closer is one more person safe. Run it back.',

    // Legend (menu)
    legend_grab: 'Grab \u2014 helps',
    legend_dodge: 'Dodge \u2014 costs a life',
    legend_phone: 'Phone',
    legend_phone_pts: '+250 pts',
    legend_flash: 'Flashlight',
    legend_flash_pts: '+150 pts',
    legend_water: 'Water',
    legend_water_pts: '+50 pts',
    legend_aid: 'First-aid',
    legend_aid_pts: '+1 life',
    legend_debris: 'Debris',
    legend_car: 'Wrecked car',
    legend_barricade: 'Barricade',
    legend_drone: 'Drone',
  },

  uk: {
    // HUD
    hud_score: 'Рахунок',
    hud_lives: 'Життя',
    hud_distance: 'Відстань',
    best: 'Рекорд',
    unit_m: 'м',
    swipe_hint: 'Проведи \u2190 \u2192 \u2014 змінити смугу \u00b7 торкнися \u23f8 \u2014 пауза',
    pause_btn: '\u23f8 Пауза',
    resume_btn: '\u25b6 Продовжити',
    pause_aria: 'Пауза або продовжити (Esc)',
    mute_aria: 'Увімкнути/вимкнути звук (M)',
    lang_aria: 'Змінити мову',
    sign_word: '\u0423\u041a\u0420\u0406\u0422\u0422\u042f',

    // Menu / pause / game-over overlay
    menu_title: 'Повітряна тривога',
    menu_text:
      'Сирена повітряної тривоги виє. Треба встигнути до найближчого ' +
      'укриття до початку обстрілу. Уникай уламків і зламаних авто, збирай ' +
      'необхідне, слідуй за зеленими вказівниками УКРИТТЯ.',
    menu_btn: 'Почати біг (Пробіл)',
    menu_hint:
      '\u2190 \u2192 або A/D \u2014 змінити смугу \u00b7 \u2191/W \u2014 стрибок (уламки, барикади \u2014 не авто) \u00b7 ' +
      '\u2193/S \u2014 схилитися під дронами \u00b7 Esc \u2014 пауза',
    pause_title: 'Пауза',
    pause_text:
      'Ви пробігли <b>{n} {u}</b> \u00b7 рахунок <b>{s}</b>.<br>' +
      'Сирена все виє. Зіб\u2019єрся й знову вийди.',
    pause_overlay_btn: 'Продовжити (Esc)',
    pause_hint: 'Esc або P \u2014 продовжити \u00b7 M \u2014 вимкнути звук',
    over_title: 'Вас застигло на відкритому',
    over_text:
      'Ви пробігли <b>{n} {u}</b> та набрали <b>{s}</b>.<br>Рекорд: <b>{b}</b>',
    over_btn: 'Спробувати ще (R)',
    over_hint: 'Кожен метр ближче \u2014 ще одна людина в безпеці. Пробіжи ще раз.',

    // Legend (menu)
    legend_grab: 'Збирай \u2014 допомагає',
    legend_dodge: 'Уникай \u2014 коштує життя',
    legend_phone: 'Телефон',
    legend_phone_pts: '+250 балів',
    legend_flash: 'Ліхтарик',
    legend_flash_pts: '+150 балів',
    legend_water: 'Вода',
    legend_water_pts: '+50 балів',
    legend_aid: 'Аптечка',
    legend_aid_pts: '+1 життя',
    legend_debris: 'Уламки',
    legend_car: 'Зламаний авто',
    legend_barricade: 'Барикада',
    legend_drone: 'Дрон',
  },
};

let current = 'en';

/** Pick the initial language: stored choice first, then the browser locale. */
export function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    /* no localStorage (e.g. privacy mode) — fall through */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return nav.toLowerCase().startsWith('uk') ? 'uk' : 'en';
}

/** The active language code (init from `detectLang()` on first read). */
export function getLang() {
  if (current === 'en' && !initDone) {
    current = detectLang();
    initDone = true;
  }
  return current;
}
let initDone = false;

/**
 * Persist + activate a language. Throws for unsupported codes so a typo can't
 * silently corrupt the stored choice. main.js re-renders the UI after this.
 */
export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) throw new Error('i18n: unsupported language "' + lang + '"');
  current = lang;
  initDone = true;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* best-effort persistence */
  }
}

/** The other supported language (what the toggle button would switch to). */
export function nextLang() {
  return getLang() === 'en' ? 'uk' : 'en';
}

/**
 * Translate a key in the active language. Unknown keys fall back to English,
 * then to the key itself, so a missing string never renders blank.
 */
export function t(key, vars) {
  const dict = STRINGS[getLang()] || STRINGS.en;
  let out = dict[key] !== undefined ? dict[key] : STRINGS.en[key] !== undefined ? STRINGS.en[key] : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split('{' + k + '}').join(String(v));
    }
  }
  return out;
}
