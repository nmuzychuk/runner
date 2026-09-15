// Shared palette + canvas-generated textures (our "manually made assets").
// No external image files: every texture is drawn to a <canvas> at runtime.
import * as THREE from 'three';

// Air-raid dusk palette.
export const COLORS = {
  sky: 0x3d4656, // smoky blue-grey (lightened so the scene reads less dark)
  fog: 0x454e5e, // slightly lighter than the sky for soft depth
  skyHorizon: 0x5a4636, // warm ember glow on the horizon
  road: 0x3f434a, // worn gray asphalt
  sidewalk: 0x2c2f34,
  building: 0x23262c,
  buildingDark: 0x1a1c20,
  windowLit: 0xffc24a, // warm interior light
  lane: 0xb9c2cc,
  sign: 0x1f7a4d, // SHELTER green
  signText: 0xeafff2,
  player: 0x3b4654,
  accent: 0xff5a3c, // air-raid red-orange
  itemGlow: 0x7fd6ff,
};

// ---------------------------------------------------------------------------
// Eastern-European "panel building" (панельки) facade generator.
// Muted 70s–80s pastel paint jobs, window grids, occasional balconies with
// railings, weathering streaks and a dark slab roof band.
// ---------------------------------------------------------------------------
const HEX = (n) => '#' + n.toString(16).padStart(6, '0');

// Muted "gushiny" pastels — the classic Soviet/Eastern-Euro panel palette.
export const PANEL_STYLES = [
  { base: 0xc9b3a6, name: 'dusty rose' },
  { base: 0xb4bfa4, name: 'sage' },
  { base: 0xcfc09b, name: 'pale ochre' },
  { base: 0xa8b8c6, name: 'muted blue' },
  { base: 0xd4cdb8, name: 'cream' },
  { base: 0xb3adbd, name: 'grey-lavender' },
  { base: 0xb58d80, name: 'faded brick' },
  { base: 0x9fa8a2, name: 'slate' },
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slightly darker/lighter variant of a base colour (for bands + sides).
function shade(hex, amt) {
  const r = Math.min(255, Math.max(0, (hex >> 16) + amt));
  const gg = Math.min(255, Math.max(0, ((hex >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (hex & 255) + amt));
  return HEX((r << 16) | (gg << 8) | b);
}

// Draw a panel-building facade onto a (reusable) canvas.
export function drawPanelFacade(canvas, { cols = 4, rows = 10, seed = 1, base = 0xc9b3a6 } = {}) {
  const u = 32; // pixels per window cell
  const W = cols * u;
  const H = rows * u;
  const c = canvas;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry(seed);
  const baseHex = HEX(base);

  // Painted base coat
  g.fillStyle = baseHex;
  g.fillRect(0, 0, W, H);

  // Weathering: vertical water stains + grime blotches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    g.strokeStyle = `rgba(30,32,38,${0.03 + rnd() * 0.09})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    g.moveTo(x, rnd() * H * 0.5);
    g.lineTo(x + (rnd() - 0.5) * 14, H);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(25,27,32,${0.03 + rnd() * 0.05})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 2 + rnd() * 9, 0, Math.PI * 2);
    g.fill();
  }

  // Roof slab band (top) + painted accent stripe below it
  g.fillStyle = shade(base, -42);
  g.fillRect(0, 0, W, u * 0.5);
  g.fillStyle = shade(base, -24);
  g.fillRect(0, u * 0.5, W, 3);
  // Ground-floor plinth (darker, concrete)
  g.fillStyle = shade(base, -30);
  g.fillRect(0, H - u * 0.7, W, u * 0.7);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, H - u * 0.7, W, 2);

  // Balcony columns — a few bays get continuous balconies with railings
  const balconyBays = new Set();
  for (let x = 0; x < cols; x++) if (rnd() < 0.3) balconyBays.add(x);

  const pad = 6;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const wx = x * u + pad;
      const wy = y * u + pad;
      const ww = u - pad * 2;
      const wh = u - pad * 2;

      // Window frame (off-white painted aluminium)
      g.fillStyle = HEX(0xd8d4c8);
      g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

      // Glass — more lit windows, and a brighter warm interior. This texture is
      // also used as an emissiveMap on the facade, so lit windows glow even in
      // the darker parts of the dusk scene.
      if (rnd() < 0.55) {
        const warm = 240 + Math.floor(rnd() * 15);
        g.fillStyle = `rgb(${warm},${190 + Math.floor(rnd() * 45)},${100 + Math.floor(rnd() * 50)})`;
      } else {
        const a = Math.floor(rnd() * 26);
        g.fillStyle = `rgb(${30 + a},${40 + a},${50 + a})`;
      }
      g.fillRect(wx, wy, ww, wh);
      // Centre mullion
      g.fillStyle = HEX(0xcfcabc);
      g.fillRect(wx + ww / 2 - 1, wy, 2, wh);

      // Balcony: slab + vertical railing bars over this bay
      if (balconyBays.has(x) && y > 0) {
        g.fillStyle = HEX(0x9aa0a0);
        g.fillRect(wx - 4, wy + wh, ww + 8, 4); // slab
        g.strokeStyle = HEX(0x6f7676);
        g.lineWidth = 1.5;
        for (let bx = wx - 2; bx <= wx + ww + 2; bx += 4) {
          g.beginPath();
          g.moveTo(bx, wy + wh + 2);
          g.lineTo(bx, wy + wh + 12);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(wx - 4, wy + wh + 12);
        g.lineTo(wx + ww + 4, wy + wh + 12);
        g.stroke();
      }
    }
  }

  return c;
}

// Wrap a facade canvas in a (reusable) THREE texture.
export function facadeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Flat end-wall texture (side faces of the box): same paint, a few dark windows.
export function panelSideTexture({ base = 0xc9b3a6, seed = 1 } = {}) {
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry(seed ^ 0x9e3779b9);
  g.fillStyle = HEX(base);
  g.fillRect(0, 0, W, H);
  g.fillStyle = shade(base, -36);
  g.fillRect(0, 0, W, 12);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(30,32,38,${0.04 + rnd() * 0.08})`;
    g.lineWidth = 1 + rnd() * 3;
    const x = rnd() * W;
    g.beginPath();
    g.moveTo(x, 14);
    g.lineTo(x + (rnd() - 0.5) * 10, H);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const lit = rnd() < 0.25;
    g.fillStyle = lit ? `rgb(${210 + Math.floor(rnd() * 40)},160,90)` : 'rgb(30,38,46)';
    g.fillRect(16 + Math.floor(rnd() * 6) * 14, 26 + i * 38, 12, 16);
  }
  return facadeTexture(c);
}

// Legacy API: dark generic facade (kept in case anything still references it).
export function buildingTexture(opts = {}) {
  return facadeTexture(drawPanelFacade(document.createElement('canvas'), { ...opts, base: 0x202329 }));
}

// Soft radial glow sprite (used for smoke puffs, explosions, item halos).
export function glowTexture({ inner = 'rgba(255,255,255,0.95)', outer = 'rgba(255,255,255,0)' } = {}) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A simple green "SHELTER" sign with an arrow and text.
// mirror=true draws the arrow to the LEFT edge (for the right-hand roadside
// sign pointing back toward the road) while keeping the text readable.
// `text` is the word to print (localized: SHELTER / УКРИТТЯ). The canvas is
// wide enough to fit the whole word next to the running-man arrow, and the
// font is auto-scaled down if the word would otherwise overflow.
export function shelterSignTexture(mirror = false, text = 'SHELTER') {
  const W = 832;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // green board
  g.fillStyle = '#1f7a4d';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#0c2a1a';
  g.lineWidth = 12;
  g.strokeRect(10, 10, W - 20, H - 20);
  // running-man arrow (right by default, left when mirrored), pinned to outer edge
  g.fillStyle = '#eafff2';
  if (!mirror) {
    g.beginPath();
    g.moveTo(W - 150, H / 2 - 46);
    g.lineTo(W - 40, H / 2);
    g.lineTo(W - 150, H / 2 + 46);
    g.closePath();
    g.fill();
    g.fillRect(W - 210, H / 2 - 16, 70, 32);
  } else {
    g.beginPath();
    g.moveTo(150, H / 2 - 46);
    g.lineTo(40, H / 2);
    g.lineTo(150, H / 2 + 46);
    g.closePath();
    g.fill();
    g.fillRect(100, H / 2 - 16, 70, 32);
  }
  // text (stays readable either way), auto-sized to fit the space before the arrow.
  // Both orientations are symmetric: the word occupies the ~576px side opposite
  // the arrow (arrow head reaches 210px from the near edge), so the budget is
  // the same for mirror and non-mirror.
  const MAX = 96;
  const budget = W - 210 - 36 - 10;
  let size = MAX;
  g.font = `bold ${size}px system-ui, sans-serif`;
  while (size > 24 && g.measureText(text).width > budget) {
    size -= 4;
    g.font = `bold ${size}px system-ui, sans-serif`;
  }
  g.textBaseline = 'middle';
  if (!mirror) {
    g.textAlign = 'left';
    g.fillText(text, 36, H / 2 + 6);
  } else {
    g.textAlign = 'right';
    g.fillText(text, W - 36, H / 2 + 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Road lane divider (a single dash).
export function dashTexture() {
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#c3cbd4';
  g.fillRect(8, 12, W - 16, H - 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
