# Air Raid Runner

An in-browser 3D endless runner built entirely by **Qwen 3.8 27B** — no
human-authored code. The project serves as an end-to-end exercise of the
model's coding abilities: from initial architecture through implementation,
debugging, visual polish, localisation, performance tuning, documentation,
and CI, with all the real-world consequences each step carries.

## Scope

The model was responsible for the full stack, including:

- Game architecture and implementation (~20 ES modules: physics, spawning,
  collision, scoring, rendering, audio, input, state management)
- Character integration (rigged GLB with procedural idle/run crossfade,
  synthesised crouch, hit-flash, invulnerability effects)
- All textures generated at runtime on canvas — zero image assets
- All audio synthesised via Web Audio API (siren, SFX, drone hum, stings)
- EN/UK localisation spanning DOM elements and 3D canvas text
- Debugging real browser issues (stale module cache, GPU memory leaks,
  canvas text overflow, overlay stacking, WebGL warnings)
- Maintaining a green test suite (56 unit + 5 e2e) across every change
- Keeping `docs/ARCHITECTURE.md` current as a living design document

## Getting started

```bash
python3 -m http.server 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser.

## Testing

```bash
npx vitest run        # 56 unit tests (pure-JS core, runs in Node)
npx playwright test   # 5 e2e tests (headless browser)
```

## Architecture

The codebase is split into two deliberately isolated layers:

| Layer          | Concern                            | Tested via            |
| -------------- | ---------------------------------- | --------------------- |
| `js/core/`     | Game logic (no DOM, no three.js)   | Node / Vitest         |
| `js/render/`   | three.js scene, textures, effects  | Browser / Playwright  |

`js/app/main.js` is the composition root that wires input, HUD, and the
render loop together. All tunables are centralised in `js/core/config.js`.

## Deployment

The site is fully static. GitHub Actions (`.github/workflows/deploy.yml`)
runs both test suites on every push to `main`, then uploads the production
files to GitHub Pages.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design notes,
  coordinate conventions, and known gotchas.
