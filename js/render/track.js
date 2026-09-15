// The endless street. Everything here scrolls toward the player and recycles,
// so the city is procedurally endless. Exposes .update(travel, t).
import * as THREE from 'three';
import { COLORS, PANEL_STYLES, drawPanelFacade, panelSideTexture, facadeTexture, shelterSignTexture, glowTexture } from './palette.js';
import { t } from '../i18n.js';

const SEG = 14; // metres per building block
const COUNT = 16; // blocks per side kept alive (=> 224m of street ahead)
const DEPTH = 10; // building depth (metres, +z)

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class Track {
  constructor(scene, { seed = 7 } = {}) {
    this.scene = scene;
    this.seed = seed;
    this._rng = rand(seed);
    // Signs now sit on ONE side of the street only (screen-left = world +x,
    // because the camera at z=-7 looking down +z flips x on screen). All of
    // them use the same non-mirror texture: text on the left, arrow on the
    // right — which, from the player's view, points from the sidewalk toward
    // the road centre, i.e. "the shelter is in the building behind this sign".
    this.signTex = shelterSignTexture(false, t('sign_word'));
    this._build();
  }

  /**
   * Re-bake the sign texture with the current language's word and
   * re-apply it to every live sign board. Disposes the old texture first
   * so no GPU memory leaks accumulate across language switches.
   */
  refreshSigns() {
    this.signTex.dispose();
    this.signTex = shelterSignTexture(false, t('sign_word'));
    for (const sign of this.signs) {
      const board = sign.userData.board;
      if (board) {
        board.material.map = this.signTex;
        board.material.needsUpdate = true;
      }
    }
  }

  _build() {
    const s = this.scene;

    // Road
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 1200),
      new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 0.95, metalness: 0 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 250);
    road.receiveShadow = true;
    s.add(road);

    // Sidewalks
    const sideMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 1200), sideMat);
      sw.position.set(side * 7.5, 0.1, 250);
      sw.receiveShadow = true;
      s.add(sw);
      // curb
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.12, 1200),
        new THREE.MeshStandardMaterial({ color: 0x111214 }),
      );
      curb.position.set(side * 5.9, 0.06, 250);
      s.add(curb);
    }

    // Lane divider dashes (two strips between the three lanes)
    const dashMat = new THREE.MeshBasicMaterial({
      map: null,
      color: 0xc3cbd4,
      transparent: true,
      opacity: 0.8,
    });
    // We'll make dashes as small planes so they can recycle with buildings.
    this.dashes = [];
    for (const laneLine of [-1.2, 1.2]) {
      for (let i = 0; i < COUNT * 2; i++) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.4), dashMat.clone());
        d.rotation.x = -Math.PI / 2;
        d.position.set(laneLine, 0.02, i * (SEG / 2) + 6);
        s.add(d);
        this.dashes.push(d);
      }
    }

    // Buildings on both sides (recycling blocks)
    this.buildings = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < COUNT; i++) {
        const b = this._makeBuilding();
        b.side = side;
        this._place(b, i);
        this._rollBuilding(b);
        this.scene.add(b);
        this.buildings.push(b);
      }
    }

    // Shelter signs — screen-LEFT side only, tucked into the 2m gaps between
    // the panel-building footprints so they read as "between the buildings".
    // Building footprints on +x span z ∈ [i*SEG, i*SEG+10]; the gap after
    // each block is z ∈ [i*SEG+10, i*SEG+14]. Placing a sign at z = k*SEG + 12
    // (k a multiple of 6, so signs are 84m apart) lands it in a gap, and
    // because both the sign recycle step (240m) and the building block period
    // (14m) are multiples of 14, the sign stays in a gap through every
    // recycle. 5 signs spaced 84m apart cover 420m, well past the 240m
    // recycle step, so there is never a long gap without a sign.
    const SIGN_X = 6.6; // left sidewalk, in front of the +x building row
    const SIGN_Y_ROT = -Math.PI / 2; // face the player (matches old +x-side rotation)
    this.signs = [];
    for (let i = 0; i < 5; i++) {
      const sign = this._makeSign();
      this.scene.add(sign);
      this.signs.push(sign);
      sign.position.set(SIGN_X, 0, 12 + i * 6 * SEG);
      sign.rotation.y = SIGN_Y_ROT;
    }

    // Tall street lights lining both sides of the street (recycle with the road).
    this.lamps = [];
    const lampTex = glowTexture({ inner: 'rgba(255,214,150,0.95)', outer: 'rgba(255,214,150,0)' });
    this._lampTex = lampTex;
    this._lampHaloMat = new THREE.SpriteMaterial({ map: lampTex, transparent: true, depthWrite: false, opacity: 0.5 });
    const LAMP_SPACING = 32;   // metres between consecutive lamps on the same side
    const LAMP_COUNT = 8;      // lamps kept alive per side
    for (const side of [-1, 1]) {
      for (let i = 0; i < LAMP_COUNT; i++) {
        const lamp = this._makeLamp(side);
        lamp.position.set(side * 5.6, 0, i * LAMP_SPACING + 8);
        this.scene.add(lamp);
        this.lamps.push(lamp);
      }
    }
    this._lampSpan = LAMP_COUNT * LAMP_SPACING;

    // Distant smoke plumes (atmosphere)
    this.smoke = this._makeSmoke();
    s.add(this.smoke);

    this.span = COUNT * SEG;
  }

  _makeBuilding() {
    // Facade (street-facing) canvas that can be redrawn in place when recycled.
    const facadeCanvas = document.createElement('canvas');
    const texFront = facadeTexture(facadeCanvas);
    texFront.colorSpace = THREE.SRGBColorSpace;

    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // pivot at ground level

    // Material order: +x, -x, +y(top/roof), -y(bottom), +z(front/facade), -z
    const mats = [];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.95 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x202227, roughness: 0.95 });
    const sideMat = new THREE.MeshStandardMaterial({ map: panelSideTexture({ base: 0x9aa0a6 }), roughness: 0.9 });
    // The facade texture doubles as an emissiveMap so the lit windows glow on
    // their own (the dark glass / plinth emit little, so they stay dark).
    const frontMat = new THREE.MeshStandardMaterial({
      map: texFront, roughness: 0.85,
      emissive: 0xffffff, emissiveMap: texFront, emissiveIntensity: 0.6,
    });
    mats.push(sideMat, sideMat, roofMat, bottomMat, frontMat, sideMat);

    const mesh = new THREE.Mesh(geo, mats);
    g.add(mesh);

    g.userData = {
      mesh, texFront, facadeCanvas,
      sideMat, frontMat, roofMat, bottomMat,
      baseW: 1, baseH: 1, type: 0,
    };
    return g;
  }

  _place(b, i) {
    // Place buildings ahead of the player along +z; they stream toward the camera.
    // The road runs along +z; buildings need their facade (box's +z face)
    // pointing at the road: right side → −x world (θ = −π/2), left side → +x world (θ = +π/2).
    b.rotation.y = b.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    b.position.set(b.side * (8 + b.userData.baseW / 2), 0, i * SEG + SEG / 2);
  }

  _makeSign() {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(4.3, 1.0),
      new THREE.MeshBasicMaterial({ map: this.signTex, transparent: true }),
    );
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x8a8f99 }),
    );
    pole.position.y = 1.5;
    const g = new THREE.Group();
    board.position.y = 3.1;
    g.add(board, pole);
    g.userData.board = board; // single shared texture (all signs on one side)
    return g;
  }


  // A tall street lamp: base, slender pole, horizontal arm toward the road and a
  // warm glowing head with a soft halo sprite (light-independent, so it reads as
  // lit even in the dusk scene).
  _makeLamp(side) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x565c66, roughness: 0.6, metalness: 0.5 });
    const H = 7.4; // pole height

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.5, 12), metal);
    base.position.y = 0.25;
    base.castShadow = true;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, H, 10), metal);
    pole.position.y = H / 2;
    pole.castShadow = true;
    g.add(base, pole);

    // Arm reaching out over the road (toward the centre, −side in x)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8), metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-side * 0.85, H, 0);
    arm.castShadow = true;
    g.add(arm);

    // Lamp head at the arm tip, with a bright emissive underside + halo sprite
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x2a2e34, emissive: 0xffcf8a, emissiveIntensity: 1.4 }),
    );
    head.position.set(-side * 1.7, H - 0.05, 0);
    g.add(head);

    const halo = new THREE.Sprite(this._lampHaloMat);
    halo.position.set(-side * 1.7, H - 0.15, 0);
    halo.scale.set(3.2, 3.2, 1);
    g.add(halo);

    return g;
  }

  // Assign a fresh panel-building type (cols/rows/base colour) to a building group.
  _rollBuilding(b) {
    const cols = 3 + Math.floor(this._rng() * 3); // 3..5 window bays
    const rows = 5 + Math.floor(this._rng() * 7); // 5..11 floors
    const base = PANEL_STYLES[(this._rng() * PANEL_STYLES.length) | 0].base;
    const seed = (this._rng() * 1e9) | 0;
    const h = rows * 1.3;
    const w = cols * 1.6;
    const d = DEPTH;
    b.userData.mesh.scale.set(w, h, d);
    b.userData.baseW = w;
    b.userData.baseH = h;
    b.userData.type = seed;
    drawPanelFacade(b.userData.facadeCanvas, { cols, rows, seed, base });
    b.userData.texFront.needsUpdate = true;
    // Re-tint side face to roughly match the facade base
    const oldSide = b.userData.sideMat.map;
    if (oldSide) oldSide.dispose();
    b.userData.sideMat.map = panelSideTexture({ base, seed });
    b.userData.sideMat.needsUpdate = true;
    b.position.x = b.side * (8 + w / 2);
  }

  _makeSmoke() {
    const g = new THREE.Group();
    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(120,120,120,0.55)');
      grd.addColorStop(1, 'rgba(120,120,120,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this._smokePuffs = [];
    for (let i = 0; i < 5; i++) {
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.4 }),
      );
      spr.position.set((i % 2 ? -1 : 1) * (14 + i * 6), 10 + i * 4, 60 + i * 30);
      spr.scale.set(22 + i * 6, 22 + i * 6, 1);
      g.add(spr);
      this._smokePuffs.push(spr);
    }
    return g;
  }

  // Move the world by `travel` metres (the player advances forward into +z).
  // Everything ahead of the player streams toward the camera and recycles from
  // the far end, selling the sense of running forward into the street.
  update(travel, t) {
    const span = this.span; // buildings total length (COUNT * SEG)
    const dashSpan = COUNT * (SEG / 2);
    // Buildings
    for (const b of this.buildings) {
      b.position.z -= travel;
      if (b.position.z < -SEG) {
        b.position.z += span;
        // re-roll to keep it fresh (redraws facade in place — no texture leaks)
        this._rollBuilding(b);
      }
    }
    // Dashes
    for (const d of this.dashes) {
      d.position.z -= travel;
      if (d.position.z < -4) d.position.z += dashSpan;
    }
    // Street lights
    for (const lamp of this.lamps) {
      lamp.position.z -= travel;
      if (lamp.position.z < -6) lamp.position.z += this._lampSpan;
    }
    // Signs (left side only). Recycle step is 240m = 17 * 14, so the new z
    // is still at a building-gap offset (z ≡ 12 mod 14) and the sign stays
    // nestled between buildings.
    for (const sign of this.signs) {
      sign.position.z -= travel;
      if (sign.position.z < -12) {
        sign.position.z += 240;
      }
    }
    // Smoke drift (parallax — moves slower than the street)
    for (const p of this._smokePuffs) {
      p.position.z -= travel * 0.4;
      p.position.y += Math.sin(t * 0.3 + p.position.x) * 0.02;
      if (p.position.z < -30) p.position.z += 260;
    }
  }
}
