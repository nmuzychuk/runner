# Air Raid Runner — Architecture

Static three.js endless runner (Ukrainian air-raid theme). No build step, no bundler,
no runtime npm dependencies — it deploys to GitHub Pages as-is. The only hard
runtime dependencies are vendored into `vendor/`:

| Asset                            | Source                                        | Notes |
|----------------------------------|-----------------------------------------------|-------|
| `vendor/three.module.js`         | three.js **r169**                             | resolved via the import map in `index.html` (`"three": "./vendor/three.module.js"`) |
| `vendor/Soldier.glb` (2.1 MB)    | three.js r169 sample (MIT)                    | rigged, textured human with baked clips: **Idle, Run, TPose, Walk** (no crouch clip) |
| `vendor/loaders/GLTFLoader.js`   | three.js r169 `examples/jsm/loaders/`         | kept in `vendor/loaders/` so its relative import `../utils/BufferGeometryUtils.js` resolves to `vendor/utils/` |
| `vendor/utils/BufferGeometryUtils.js` | three.js r169 `examples/jsm/utils/`    | imported by `GLTFLoader.js` |
| `vendor/pico.min.css`            | Pico CSS                                      | UI styling only |

## Layering

```
                ┌───────────────────────────┐
                │      js/app/main.js       │  input, RAF loop, HUD, overlays, SFX
                └────┬────────────────┬─────┘
        reads state  │                │ drives
        ┌────────────▼────┐   ┌───────▼────────────────┐
        │  js/core/* (pure)│   │   js/render/* (three.js)│
        │  no DOM, no GL   │   │  scene, meshes, anims   │
        └─────────────────┘   └─────────────────────────┘
                                js/audio/sound.js (procedural Web Audio, no assets)
```

`js/core/` is **framework-free** (no three.js, no DOM) and therefore unit-testable in
Node via Vitest. It produces plain objects and an event list per frame. `js/render/`
is the only layer that touches WebGL. `js/app/main.js` is the glue: it owns input,
the requestAnimationFrame loop, the DOM HUD, and plays sound in response to events.

### Data flow

```
keydown ──► game.move/jump/crouch/start/pause()
              │
        game.step(dt)  ──►  mutates distance/objects/lane/…
              │
              └─►  returns events[]  ──►  main.js plays SFX + HUD refresh
                                              │
                              renderer.sync(game, dt, t)  ──►  three.js frame
```

`Game` never knows about three.js. `Renderer.sync()` is the single read-only
projection of the game state into the scene each frame — it reconciles object
meshes by id, animates the player, applies camera shake, and renders.

## Core (`js/core/`)

### `config.js` — the single source of truth

All tunables live here. Highlights (values current as of this doc):

| Constant                | Value / shape                                              |
|-------------------------|------------------------------------------------------------|
| `LANES`, `LANE_WIDTH`   | 3, 2.4 m                                                  |
| `laneX(lane)`           | `((LANES−1)/2 − lane) * LANE_WIDTH` — lane 0 → **+x** = **screen left** (camera sits at −z looking down +z, which mirrors left/right vs. three.js defaults) |
| `PLAYER`                | `halfZ 0.9`, `collisionZWindow 1.5`, `invulnTime 1.1`     |
| `SPEED`                 | `base 13`, `max 34`, `accelPerMeter 0.006`                |
| `FALL`                  | debris: `startY 10`, `speed 10`, `collisionY 2`, `aheadDebris 40` |
| `DRONE_AHEAD_SPEED`     | 10 m/s extra closing speed                                 |
| `JUMP`                  | `duration 0.72 s`, `height 1.6 m`, `minClearY 0.2 m`     |
| `CROUCH`                | `duration 0.9 s`, `headY 0.9 m`                            |
| `SPAWN`                 | `ahead 46`, `despawnBehind 6`, `gapBase 20`, `gapMin 11`, `maxHazardsPerWave 3` |
| `DIFFICULTY.rampTo`     | 2200 m                                                     |
| `LIVES.max`             | 3                                                          |
| `HAZARDS`               | `['debris','car','barricade','drone']`                    |
| `ITEMS`                 | `['phone','flashlight','water','firstaid']`               |
| `TYPE_META`             | per-type flags: `falling`, `flying` (+`flyY`), `jumpable`, `crouchable`, `bonus`, `heal` |
| `SCORE`                 | `perMeter 1`, `milestoneEvery 500`                         |

### `game.js` — the brain

`class Game` — public API:

| Member | Returns / throws | Notes |
|---|---|---|
| `start()` | — | only from `menu`/`gameover` |
| `pause()` | `true`/`false` | **toggle**: `running ⇄ paused`; returns `false` otherwise |
| `move(dir)` | `true`/`false` | dir −1 left / +1 right; clamped to lanes; only while `running` |
| `jump()` | `true`/`false` | sets `jumpT = JUMP.duration`; cancels `crouchT`; no re-jump mid-air |
| `crouch()` | `true`/`false` | sets `crouchT = CROUCH.duration`; blocked while airborne; holding the key re-arms it every frame |
| `step(dt)` | `events[]` | clamps `dt` to 0.05 s; advances distance/speed; moves objects; spawns waves; collects items; resolves collisions; culls; emits milestones; flips to `gameover` when `lives ≤ 0` |
| `reset(seed?)` | — | restores initial state, `state='menu'` |
| `player()` | `{ lane, z, invuln, y, crouch }` | `y` is a parabola: `max(minClearY, height·4·p·(1−p))` while `jumpT>0` (effective from the first frame) |
| `score` (getter) | number | `floor(distance · perMeter) + bonus` |
| `state` | `'menu' \| 'running' \| 'paused' \| 'gameover'` | — |
| `events` | array | transient per-frame notifications consumed by `main.js` / `Renderer.sync` |

Object shape in `game.objects`:
```
{ id, type, lane, z, y, hazard, item, collected, landed? }
```
- `y` semantics: `0` for ground; `FALL.startY` → falling (decreases to 0); `flyY`
  (drone). `meta.falling` / `meta.flying` drive the update path in `step()`.
- `landed` — present **only** on falling debris. `false` while airborne, set `true`
  the first frame it reaches `y === 0`. `step()` emits a `debris_land` event exactly
  once (guarded by the flag) when this flips, so the renderer can puff smoke and
  `main.js` can play the impact SFX.

### `spawner.js` — waves

`class Spawner({seed})`. `update(distance)` returns the wave descriptors whose
spawn distance has been crossed. `makeWave(rng, difficulty)` guarantees **at most
2 hazard lanes** are blocked, leaving an escape lane. Item probability 0.4, dropped
in one of the free lanes. Wave gap = `lerp(gapBase, gapMin, difficulty) *
rng.range(0.85, 1.2)`. Loop-guarded (64 iters max) against pathological `dt`.

### `collision.js` — per-type escape rules

`objectsOverlap(player, obj)` — returns `true` if the player takes damage. Rules
(checked in this order):

1. `player.invuln > 0` → false (i-frames)
2. `obj.lane !== player.lane` → false
3. `|obj.z − player.z| > PLAYER.collisionZWindow` → false
4. Per-type vertical escape:
   - **falling (debris)**: `obj.y > FALL.collisionY` → false; `player.y > JUMP.minClearY` → false
   - **flying (drone)**: `obj.y < 0.5` → false; `player.y > JUMP.minClearY` → false;
     **or** `player.crouch && obj.y > CROUCH.headY` → false (ducked underneath)
   - **jumpable (barricade)**: `player.y > JUMP.minClearY` → false
   - **car** (and anything else): no vertical escape — lane + z window decide

`firstCollision(player, objects)` → first hazard (or null).
`overlappingItems(player, objects)` → array of collectibles.

### `score.js` / `rng.js`

`scoreForDistance`, `nextMilestone`. `makeRng(seed)` — deterministic xorshift-like
RNG with `.bool(p)`, `.range(a,b)`, `.pick(arr)`, `.shuffle(arr)`.

## Rendering (`js/render/`)

### `renderer.js`

- `new Renderer(canvas)` builds the scene (fog, hemi + 2 directional lights,
  `Track`, `Player`, `Effects`), and a camera at `(0, 4.4, −7)` looking at
  `(0, 1.6, 12)` — a low chase cam behind the player.

**Lighting & shadows** (brightened so the scene reads less dark):

- `shadowMap` enabled, `PCFSoftShadowMap`.
- `HemisphereLight(0x8295ad, 0x3a3a30, 1.7)` — ambient sky/ground fill.
- Sun `DirectionalLight(0xffd9a0, 1.5)` at `(-6, 14, -6)`, `castShadow = true`,
  `shadow.mapSize 2048²`, target at `(0, 0, 20)`, shadow camera ortho frustum
  `near 0.5 / far 70 / left -14 / right 14 / top 30 / bottom -6`,
  `bias -0.0004`, `normalBias 0.03` — this is the only light that casts.
- Rim `DirectionalLight(0x4a6ea0, 0.7)` at `(4, 6, 8)` — cool backlight.
- Fog `new THREE.Fog(COLORS.fog ?? COLORS.sky, 30, 120)`.

**Shadow roles**: road + sidewalks `receiveShadow`; the Soldier, cars, debris,
barricades and drones `castShadow` (see `objects.js` / `player.js`). The drone
now casts a ground shadow — useful for reading its height when deciding to crouch.

- `sync(game, dt, t)` (per frame):
  - scrolls `Track` by distance delta;
  - reconciles `this._meshes: Map<id, {handle, group, baseY}>` with `game.objects`;
  - positions `player.group` from `game.player()` (`x = laneX(lane)`, `y = pl.y`
    for the jump arc) and calls `setCrouch(pl.crouch)`, `update(t, speed01)`;
  - `speed01 = clamp((speed − 13) / (34 − 13), 0, 1)`;
  - on `game.events` type `hit` → `player.hitFlash()` + `effects.hit(...)`;
  - on `game.events` type `debris_land` → `effects.smoke(new Vector3(laneX(lane), 0.15, z))`;
  - on `game.invuln` change → `player.showInvuln(...)`;
  - applies camera shake and renders.
- Object builders in `objects.js` expose the contract:
  `buildObject(type) → { group: THREE.Group, update(t), flash?() }`.

**Mesh lifecycle (no GPU/heap leak)**: `_addMesh` / `_removeMesh` reconcile the
`this._meshes` map with `game.objects` each frame. On despawn, `_removeMesh(id)`
traverses the object's group and disposes **every** geometry, then collects all
materials (handling material **arrays** — a car reuses one paint/tire material
across many meshes) into a `Set` and disposes each exactly once via
`_disposeMaterial(m)` (which also disposes `m.map` first). This is required
because `buildObject()` allocates **fresh** materials per object, so each
despawned object otherwise orphans 2–20 `THREE.Material` instances in the JS heap.
`_worldPos(obj)` writes into a single cached `this._v3` (both call sites consume
it immediately) instead of allocating a `Vector3` per object per frame.

### `player.js` — the Soldier

Uses the vendored **`vendor/Soldier.glb`** via `GLTFLoader` (vendored r169).
Structure:

```
this.group            ← positioned by renderer (lane x, jump y)
 └─ this.inner        ← scaled by MODEL_SCALE (1.7, big runner style ≈ ⅓ of screen height) + crouch squash
     └─ model         ← gltf.scene; rotated `rotation.y = PI` so the back faces the camera
```

Baked clips used: `Idle` (0.6×) and `Run` (1.0×), both `LoopRepeat`, both
`play()`-ed at load, `Run` cross-faded in by `effectiveWeight`:

```
runW  = 0.55 + 0.45 · min(1, speed01)          clamped to 0..1
idleW = 1 − runW
```

Note: `runW` no longer scales with crouch — the **run animation plays even
while crouching** (crouch is a pure body squash on top of the running clip).

**Crouch synthesis** (the model has no crouch clip):

- `crouch ∈ [0,1]` blended toward `crouchTarget` at `0.22`/frame.
- `inner.scale = (1.7·(1−0.12c), 1.7·(1−0.4c), 1.7·(1−0.12c))` — vertical squash to 0.6× at full crouch.
- `inner.position.y = 0.3·c` — keeps feet near the ground as the body shortens.
- Crouch is **pure squash** — it no longer fades `Run` down to `Idle`, so the
  soldier keeps its running gait while ducking (measured: `Run` weight ≈ 0.92
  both standing and fully crouched).

**Shadows** (set in `_onModel`): every mesh in the Soldier casts and receives
shadows (`model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } })`).

**Green suit tint** (applied once in `_onModel` after materials are collected):
- The Soldier is one textured body mesh (`VanguardBodyMat`) + a visor
  (`Vanguard_VisorMat`); the body texture has a wide per-region luminance spread,
  so a flat color multiply yields **different green shades per body part**
  (boots/pack darker, torso lighter).
- `BODY_GREEN = 0x8fbf52` (olive), `VISOR_GREEN = 0x5a9e30` (deeper green).
- Base emissive `0x1c2e08 @ 0.7` lifts the suit out of the dark scene and is
  stored on `Player` as `_baseEmissiveHex` / `_baseEmissiveIntensity`.

**Hit flash & invulnerability glow** (per-material emissive):
- `hitFlash()` snapshots current emissive per material, applies `#ff2211 @ 1.0`,
  and a `0.22 s` timer restores it (composited with invuln if active).
- `showInvuln(true)` → `#2a4a6a @ 0.55`; `showInvuln(false)` → restores the
  **green base emissive** (`_baseEmissiveHex @ _baseEmissiveIntensity`), not black,
  so the suit keeps its green (unless a flash restore is pending).
- `_matSet` is a `Set` of all mesh materials collected once on load —
  Soldier.glb exposes 2 unique material instances.

**Fallback**: if the GLB fails to load (network, parse error), `_fallbackBody()`
builds primitive capsules so the player is never invisible.

Public API (unchanged from the pre-Soldier version):

```
.group               THREE.Group — parent placed by the renderer
.setLaneX(x)         target lane x (lerped in update)
.setCrouch(v)        0/1 target
.update(t, speed01)  per-frame
.hitFlash()          red emissive pulse (~0.22 s)
.showInvuln(v)       blue invulnerability glow on/off
```

### `track.js`, `objects.js`, `effects.js`, `palette.js`

- `Track` — road + buildings + **localized** shelter signs (word baked from
  `t('sign_word')`: `SHELTER` / `УКРИТТЯ`) + **street lights** (textured,
  mirrored for the side the camera sees). `seed`-based deterministic layout.
  Road and sidewalks `receiveShadow` to ground the soldier's and objects'
  shadows.
  - **Shelter signs** (`_makeSign` + `refreshSigns`): a green board
    (`PlaneGeometry(4.3, 1.0)` on a 3 m pole) textured by
    `shelterSignTexture(text)` (832×192 canvas — wide enough for the whole
    word plus the running-man arrow; font auto-scaled to fit).
    **2026-09-14 redesign: signs are on ONE side only** — the screen-left
    sidewalk (world `+x = +6.6`; the camera at `z=-7` looking down `+z` flips
    x on screen). All 5 signs share the single non-mirror texture (text on
    the canvas left, arrow pointing right = from sidewalk toward the road
    centre from the player's view). `_signFacing` and `signTexMirror` were
    removed.
    **Gap placement:** +x building footprints span `z ∈ [i*14, i*14+10]`, so
    signs are placed at `z = 12 + i*84` (`i ∈ 0..4`) — i.e. `z ≡ 12 (mod 14)`,
    inside the 2 m gap after every 6th block. Signs are 84 m apart (5 signs
    cover 420 m > the 240 m recycle step, so the street never runs out of
    signs), and the recycle step `+240` keeps `z ≡ 12 (mod 14)`, so each sign
    stays nestled **between buildings** through every wrap (both 240 and the
    building period 14 are multiples of 14).
    `refreshSigns()` re-bakes the texture with the current language,
    **disposes the old texture first** (no GPU leak across toggles) and
    re-points every live board's `material.map`.
  - **Street lights** (`_makeLamp`): 8 per side, `LAMP_SPACING 32 m`, offset
    `±5.6 x`; a base + pole (≈ 7.4 m) + arm + a warm emissive head
    (`emissive 0xffcf8a @ 1.4`) + a soft `glowTexture` halo sprite. Poles cast
    shadows. Lamps recycle with the track (wrap when `z < -6` by `+256 m`).
  - **Building window glow**: the facade texture (lit-window chance `0.55`,
    bright warm RGB) is used both as `map` **and** `emissiveMap` on the front
    material (`emissive 0xffffff`, `emissiveIntensity 0.6`) so windows glow
    independently of the scene lights.
- `objects.js` — `buildObject(type)` factory returning `{group, update, flash?}`;
  8-car palette for randomised car paint. Heights are tuned against the 1.6 m
  jump: **barricade ≈ 1.42 m top** (low hurdle — jumpable), **car scaled
  `y × 1.7` to ≈ 2.4 m** (tall wreck — NOT jumpable, must change lanes),
  **drone at `flyY 3.4 m`** (duck under or jump). Barricade, car and drone
  meshes `castShadow` (drone body + rotor arms cast so its ground shadow is
  readable when deciding whether to crouch).
- `effects.js` — pooled world-space sprite FX + screen shake + HUD flash.
  - `_puff(pos, color, size, life, grow, tex, rise)` — spawn one pooled sprite
    (`tex` defaults to the warm glow texture, `rise` is upward m/s, default `2.0`).
  - `hit(pos)` — orange burst (6 puffs) + strong shake.
  - `collect(pos)` — cyan sparkle (5 puffs) + HUD flash.
  - `smoke(pos)` — **debris impact**: 6 low, slow **grey** puffs using a dedicated
    neutral `smokeTexture()` (white radial blob tinted per-sprite; the default glow
    texture is warm-orange and would wrongly tint smoke), weaker shake (`+0.15`).
  - `shakeOffset()`, `flashLevel` — consumed by renderer / HUD overlay.
- `palette.js` — `COLORS` table (road `0x3f434a`, sky `0x3d4656`, fog `0x454e5e`,
  etc.) and shared texture helpers. Sky/fog lightened so the scene reads less
  dark; facade lit-window chance raised to `0.55` with a brighter warm RGB.

## Internationalization (`js/i18n.js`)

Supports **English** and **Ukrainian**. No library — pure JS.

### API

| Export | Signature | Notes |
|--------|-----------|-------|
| `SUPPORTED` | `string[]` | `['en', 'uk']` |
| `STORAGE_KEY` | `string` | `'airraid_lang'` |
| `detectLang()` | `string` | Stored choice → `navigator.language` (starts with `'uk'` → `'uk'`, else `'en'`) |
| `getLang()` | `string` | Lazily calls `detectLang()` once; returns active lang |
| `setLang(lang)` | `void` | Throws on unsupported; persists best-effort to `localStorage` |
| `nextLang()` | `string` | Toggles between `'en'` and `'uk'` |
| `t(key, vars?)` | `string` | Looks up key in active-lang dict → EN fallback → key itself; `{k}` placeholder substitution via `vars` object |

### Key convention

Static strings (HUD labels, legend, overlay titles/texts, button labels, hints,
aria-labels) are all in `i18n.js` under `en` / `uk` objects.
Key `pause_btn` is the HUD button (`⏸ Pause` / `⏸ Пауза`); key
`pause_overlay_btn` is the overlay resume button (`Resume (Esc)` / `Продовжити (Esc)`).
Key `sign_word` is the word baked onto the 3D shelter signs (`SHELTER` /
`УКРИТТЯ`); it is consumed by `shelterSignTexture()` and re-baked by
`Track.refreshSigns()` on every language toggle.

### Wiring in `main.js`

- `applyStaticI18n()` — called once at init and on every language toggle:
  sets `<html lang>`, writes `textContent` for every `[data-i18n]` element,
  sets `aria-label` for every `[data-i18n-aria]` element, and sets the text of
  **both** language buttons — the HUD one and the start-menu one (`'UK'` if
  current is EN, `'EN'` if current is UK — shows the **target** language to
  switch to).
- `toggleLang()` — calls `setLang(nextLang())` → `applyStaticI18n()` →
  `refreshHud()` → `syncPauseBtn()` → `showOverlay(game.state)` →
  `renderer.track.refreshSigns()`. This means switching language while the
  game is paused or in gameover re-renders the overlay with the new language,
  and the 3D shelter signs are re-baked with the localized word (old textures
  disposed first).
- All dynamic strings (distance unit, pause/gameover text with `{n}/{u}/{s}/{b}`
  interpolation) go through `t()` at render time, so they update immediately.
- `ui.langBtn` click handler: `e.stopPropagation(); toggleLang();`
- **Start-menu language toggle (2026-09-14):** the start/pause/game-over overlay
  card also has a `#menu-lang-btn` (`.menu-lang-btn`) button between the Start
  button and the hint. `ui.menuLangBtn` reuses the exact same `toggleLang()`
  path, so the menu, HUD, and any open overlay all re-translate in one go. It
  shares the `lang_aria` aria hook and the same label logic as the HUD button.

### `index.html` hooks

- Every static label carries `data-i18n="<key>"` (e.g. `data-i18n="hud_score"`).
- Aria-labels carry `data-i18n-aria="<key>"` (e.g. `data-i18n-aria="pause_aria"`).
- Legend labels: `<span data-i18n="legend_grab">`, points: `<em data-i18n="legend_grab_pts">`.
- Lang buttons: `<button id="lang-btn" data-testid="lang-btn">UK</button>` inside `.hud-actions`, **and** `<button id="menu-lang-btn" class="btn btn-subtle menu-lang-btn" data-testid="menu-lang-btn" data-i18n-aria="lang_aria">EN</button>` inside the overlay card (styled by `.menu-lang-btn` in `css/app.css`).

## Audio (`js/audio/sound.js`)

Procedural Web Audio (oscillators + filtered noise). **No audio files.** Lazy —
the `AudioContext` is created on first `unlock()` (a user gesture). If the
environment has no `AudioContext` every method is a no-op and the game still runs.

Public API: `unlock()`, `play(name, {freq})`, `startSiren()`, `stopSiren()`,
`duck(level)`, `startDrone()`, `stopDrone()`, `duckDrone(level)`,
`setMuted(v)`, `get muted()`.

SFX catalog: `move`, `hit`, `collect` (per-item base freq: phone 720, flashlight
640, water 560, firstaid 880), `milestone`, `gameover`,
`debris_land` (low sine thud `90 → 42 Hz` + short low-pass filtered noise `700 Hz`,
gain ~0.32 — a dull impact, not an alarm).

**Drone hum** (Shahed-style two-stroke chug) — a *separate* Web Audio node set
from the siren so they can coexist:

- Two detuned saw oscillators (~110 Hz, +10 cents) → low-pass `850 Hz` (Q 1.4)
  → gain. A **9 Hz sine LFO** amplitude-modulates the gain (the put-put-put chug)
  and a **3.5 Hz LFO** wobbles both frequencies (±12 Hz) for the uneven engine growl.
- `startDrone()` builds/starts the chain and ramps gain to `0.07 · _droneTargetGain`
  over 0.8 s (idempotent — no-op if already running). `stopDrone()` fades out
  (τ 0.2 s) and stops the oscillators after ~0.9 s.
- `duckDrone(level)` (0..1) retargets the running gain — `main.js` ducks to `0.2`
  on pause/tab-hidden and restores to `1` on resume.
- Lifecycle: toggled **per frame** in the `main.js` RAF loop while `state === 'running'`
  (start if any `type === 'drone'` object is on screen, else stop) and force-stopped
  on gameover.

## App (`js/app/main.js`)

Wires everything together:

1. Reads URL flags: `?dev=inf` (infinite lives) and `?mute=1` (force sound off).
2. Instantiates `Game`, `Renderer`, `Sound`; exposes `window.__game/__renderer/__sound`
   for the Playwright e2e suite.
3. Keyboard handler: arrows / WASD → `move/jump/crouch`; Esc/P → `togglePause`;
   M → mute; Space/R contextual (start / resume / restart).
4. RAF loop: computes `dt`, calls `game.step(dt)` and `renderer.sync(game, dt, t)`.
   On every state transition (including `running → running`, i.e. resume) it
   calls `showOverlay(game.state)` **unconditionally** — the overlay must hide on
   resume and appear on pause/gameover regardless of which direction the transition
   took (this was a previously-fixed bug: resume used to leave the Paused card on
   screen because the loop only re-rendered the overlay when state ≠ running).
5. Plays SFX from `game.events` (hit / collect / milestone / jump / crouch / move /
   `debris_land`). While `state === 'running'` it also toggles the **drone hum**
   each frame: `sound.startDrone()` if any `type === 'drone'` object is on screen,
   else `sound.stopDrone()`. On state transitions: `gameover` → `stopDrone()`;
   `running` (resume) → `duckDrone(1)`; `paused` / tab-hidden → `duckDrone(0.2)`.
6. Persists best score and mute preference in `localStorage`
   (`airraid_best`, `airraid_muted`).

### HUD & overlays

`index.html` defines the HUD (score / lives / distance / collected icons / best)
and the overlay card (menu, paused, gameover). `showOverlay(state)` swaps the
title, body, primary button (`data-action` = start / resume / restart), the
legend, and the hint. All strings go through `t()` from `js/i18n.js` so they
respect the active language.

**HUD layout (2026-09-14 redesign)**: single flex row, `justify-content:
flex-end` (right-aligned), `flex-wrap: wrap`. `.hud-actions` (lang / pause /
mute buttons) sits at the far right. `.hud-actions { pointer-events: auto }`
makes the buttons clickable even though the parent `#hud` has
`pointer-events: none`. At ≤560 px the padding, gap, and font sizes shrink.

> **Gotcha**: the overlay (`z-index 10`) covers the HUD — lang / pause / mute
> buttons are only mouse-clickable in `running` state (expected design;
> keyboard shortcuts still work in all states).

## Coordinate & lane conventions

- Camera at `(0, 4.4, −7)`, looking at `(0, 1.6, 12)`. This is a 180° Y-rotation
  relative to three.js's default "looking down −z" — which **mirrors** left/right
  on screen. So:
  - **lane 0 → +x = SCREEN LEFT** (use `ArrowLeft` → `move(−1)` → lane 0).
  - **lane 2 → −x = SCREEN RIGHT**.
  - The Soldier model faces `+z` by default; `player.js` sets
    `model.rotation.y = PI` so its **back** faces the camera.
- The player's feet are at `y = 0`; jump height `1.6 m` at apex (duration
  0.72 s); crouch head `0.9 m`; drone flight `3.4 m`. Jump clears debris and
  the low barricade (~1.42 m top, under the 1.6 m vault), does NOT clear cars
  (~2.4 m after the ×1.7 vertical scale); crouch ducks under drones
  (`flyY 3.4 > CROUCH.headY 0.9`); jumping also avoids drones
  (feet above `minClearY 0.2`).

## Dev & testing

### Commands

```bash
# local server (any static server works)
python3 -m http.server 8000     # stop: pkill -f "http.server 8000"

# unit tests (Vitest, 5 suites / 56 tests)
npx vitest run

# e2e (Playwright, 5 specs)
npx playwright test

# recommended MCP / Playwright URL
http://127.0.0.1:8000/?dev=inf&mute=1
```

### Debug globals (set by `main.js`)

| Global             | Purpose |
|--------------------|---------|
| `window.__game`    | `Game` instance — inspect `state`, `lane`, `objects`, call `jump()/crouch()/move(±1)/step(dt)/pause()/start()/reset(seed)`, read `score/distance/invuln` |
| `window.__renderer`| `Renderer` instance — `player` (`Player`), `scene`, `camera`, `renderer` (three), `effects` |
| `window.__sound`   | `Sound` instance — `play(name)`, `startSiren()`, `startDrone()/stopDrone()/duckDrone(level)`, `setMuted(v)`, `muted`, `_droneNodes` (debug) |

### Test files

- `tests/core/collision.test.js`, `game.test.js`, `rng.test.js`, `score.test.js`,
  `spawner.test.js` — pure-JS, no DOM.
- `tests/e2e/game.spec.mjs` + `tests/e2e/server.mjs` — Playwright against a local
  HTTP server; 5 scenarios covering start, run, lane-switch, lives, lane clamping.

### Gotchas discovered while developing

- `GLTFLoader.js` must live in `vendor/loaders/` (not `vendor/`) because it
  imports `../utils/BufferGeometryUtils.js` — that path resolves to `vendor/utils/`
  only from a `loaders/` sibling directory. Moving it back to `vendor/` will 404
  at runtime.
- ES modules are cached by the browser — after editing `js/**` you must do a full
  `page.goto(...)` (not just a soft reload) for Playwright/automation.
- `python3 -m http.server` sends **no cache headers**, so the browser heuristically
  caches module files and can keep serving a stale `js/**` copy even after a full
  `goto()` of a new URL. Symptom: a new method is missing on a live instance while
  `curl`/`fetch(cache:'no-store')` show it on disk. Fix: `Network.clearBrowserCache`
  via a CDP session then reload, or open a fresh browser context to verify.
- `Game.pause()` is a **toggle**. Calling it from `running` pauses; calling it
  again from `paused` resumes. `start()` only works from `menu`/`gameover`.
- `step(dt)` clamps `dt` to 0.05 s; calling `step()` manually while the RAF loop
  is also running can double-step and confuse the state — prefer observing the
  real loop or driving the game via the public API (`jump`, `crouch`, `move`).
- Harmless console spam `GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset
  overflows texture dimensions.` — a known three.js warning on this platform,
  not an error.
- **Materials must be disposed on despawn, and the standard three.js counters
  will not tell you if you forget.** `renderer.info.memory` only tracks
  **geometries and textures — not materials** — so a material-only leak is
  invisible to `renderer.info`. Symptom: smooth ~60 fps at first, then lag
  builds after ~30 s of play (GC pressure from hundreds of orphaned
  `THREE.Material` objects). The fix lives in `Renderer._removeMesh` (see the
  "Mesh lifecycle" note above). When benchmarking, count live materials by
  traversing `scene` and `Set`-deduping, not by reading `renderer.info`.
- Playwright `locator.click` can hang on "waiting for scheduled navigations to
  finish" under heavy load even though the page is healthy (no console/page
  errors, element stable). The 4-failure run after a long in-browser benchmark
  was load-induced flakiness, not a regression — re-running after the load
  cleared passed 5/5.

## Adding content — quick recipes

- **New hazard type**: add to `HAZARDS` + `TYPE_META` (set `falling`/`flying`/
  `jumpable`/`crouchable` as needed), add a `buildObject(type)` case in
  `objects.js`, extend `objectsOverlap()` in `collision.js` if the vertical
  escape rules are not covered by the existing meta flags, add a test in
  `tests/core/collision.test.js`.
- **New item**: add to `ITEMS` + `TYPE_META` (with `bonus`, optionally `heal`),
  add a `buildObject(type)` case, add a `COLLECT_BASE_FREQ` entry in `sound.js`.
- **Tune feel**: all numbers live in `js/core/config.js` — speed, jump, crouch,
  spawn gaps, i-frames, difficulty ramp. The renderer reads `TYPE_META` only for
  visual hints (falling/flying/jumpable) — behaviour is driven by the collision
  rules and `config.js` constants.
