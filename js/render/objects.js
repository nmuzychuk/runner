// Builds a three.js object for each hazard / item type and updates it over time.
// Meshes are intentionally low-poly so they run everywhere, including software
// WebGL. Each object exposes: .group (THREE.Group), .update(t), .flash().
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { glowTexture } from './palette.js';

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });

const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

// All collectibles are "good" — they share a bright blue halo so players learn
// at a glance: blue glow = pick it up.
const BLUE_GLOW = 'rgba(70,150,255,0.95)';

// --- hazards ---------------------------------------------------------------

function makeDebris() {
  const g = new THREE.Group();
  // Vary size + shape per chunk so no two pieces of shrapnel look identical.
  const r = 0.55 + Math.random() * 0.55; // 0.55 .. 1.1 base radius
  const shapes = [
    () => new THREE.DodecahedronGeometry(r, 0),
    () => new THREE.IcosahedronGeometry(r, 0),
    () => new THREE.OctahedronGeometry(r, 0),
    () => new THREE.TetrahedronGeometry(r * 1.15, 0),
  ];
  const geo = shapes[(Math.random() * shapes.length) | 0]();
  const rock = new THREE.Mesh(geo, mat(0x3a3d42, { flatShading: true }));
  rock.castShadow = true;
  // Irregular, lumpy scale — tumbling debris, not a perfect solid.
  rock.scale.set(
    0.8 + Math.random() * 0.6,
    0.7 + Math.random() * 0.7,
    0.8 + Math.random() * 0.6,
  );
  g.add(rock);
  // crack lines follow the (random) shape + scale
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(rock.geometry),
    new THREE.LineBasicMaterial({ color: 0x111317 }),
  );
  edge.scale.copy(rock.scale);
  g.add(edge);
  // random tumble rates so each chunk spins differently
  const rx = 1.5 + Math.random() * 2;
  const ry = 1.0 + Math.random() * 2;
  return {
    group: g,
    update(t) {
      // The renderer owns the falling height (it is driven by the core so the
      // chunk actually drops from the sky). Here we only tumble it mid-air.
      rock.rotation.x = t * rx;
      rock.rotation.y = t * ry;
    },
    flash() {
      rock.material.emissive = new THREE.Color(COLORS.accent);
      rock.material.emissiveIntensity = 1.2;
      setTimeout(() => (rock.material.emissiveIntensity = 0), 90);
    },
  };
}

// Muted civilian paint jobs for the abandoned-car wave.
const CAR_PAINTS = [
  0x5b6472, // slate blue-grey
  0x7a4433, // oxidised rust-red
  0x46604a, // faded olive
  0x6e6252, // dusty tan
  0x3f5a6e, // steel blue
  0x59495e, // muted mauve
  0x8a7f5c, // drab khaki
  0x42454c, // charcoal
];

function makeCar() {
  const g = new THREE.Group();
  const paintColor = CAR_PAINTS[(Math.random() * CAR_PAINTS.length) | 0];
  const paint = mat(paintColor, { metalness: 0.35, roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x243039, metalness: 0.2, roughness: 0.15,
    transparent: true, opacity: 0.85,
  });
  const tireMat = mat(0x141518, { roughness: 0.9 });
  const hubMat = mat(0x8b939c, { metalness: 0.6, roughness: 0.3 });

  // Lower body — a long rounded slab.
  const lower = box(1.7, 0.5, 3.6, paint);
  lower.position.y = 0.55;
  lower.castShadow = true;
  g.add(lower);

  // Hood (front, lower) + trunk (rear, lower) to break up the silhouette.
  const hood = box(1.6, 0.28, 0.9, paint);
  hood.position.set(0, 0.86, 1.15);
  g.add(hood);
  const trunk = box(1.6, 0.28, 0.7, paint);
  trunk.position.set(0, 0.86, -1.35);
  g.add(trunk);

  // Cabin — slightly inset, tapered, with glass roof + windscreen.
  const cabin = box(1.5, 0.55, 1.9, paint);
  cabin.position.set(0, 1.05, -0.15);
  cabin.castShadow = true;
  g.add(cabin);
  const roof = box(1.4, 0.1, 1.7, glass);
  roof.position.set(0, 1.36, -0.15);
  g.add(roof);
  const windscreen = box(1.42, 0.5, 0.06, glass);
  windscreen.position.set(0, 1.05, 0.82);
  windscreen.rotation.x = -0.5;
  g.add(windscreen);
  const rearGlass = box(1.42, 0.5, 0.06, glass);
  rearGlass.position.set(0, 1.05, -1.1);
  rearGlass.rotation.x = 0.5;
  g.add(rearGlass);

  // Wheels — dark tyres with bright hubs, tucked under the body.
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 16);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12);
  for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1], [-0.85, -1.1], [0.85, -1.1]]) {
    const t = new THREE.Mesh(tireGeo, tireMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.34, z);
    g.add(t);
    const h = new THREE.Mesh(hubGeo, hubMat);
    h.rotation.z = Math.PI / 2;
    h.position.set(x, 0.34, z);
    g.add(h);
  }

  // Damage: scorch patch, a crumpled dent.
  const scorch = box(0.6, 0.06, 0.7, mat(0x1a1a1a, { roughness: 1 }));
  scorch.position.set(0.3, 0.9, 1.1);
  g.add(scorch);
  const dent = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat(0x3a4049, { metalness: 0.4, roughness: 0.6 }),
  );
  dent.scale.set(1, 0.4, 1);
  dent.position.set(0.5, 0.85, -1.25);
  g.add(dent);

  // Integrated red light — a single glowing unit that is a CHILD of this car's
  // group, so it can never render separately from the car. A wreck whose light
  // is still on: one headlight (front) + two taillights (rear), backed by a
  // soft red halo so it reads as "lit" even at speed.
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2e1f });
  const headlight = box(0.24, 0.16, 0.08, redMat);
  headlight.position.set(-0.5, 0.72, 1.42);
  g.add(headlight);
  for (const x of [-0.55, 0.55]) {
    const tail = box(0.22, 0.14, 0.06, redMat);
    tail.position.set(x, 0.82, -1.72);
    g.add(tail);
  }
  const haloTex = glowTexture({ inner: 'rgba(255,50,30,0.9)', outer: 'rgba(255,50,30,0)' });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false }));
  halo.scale.set(1.1, 1.1, 1);
  halo.position.set(-0.5, 0.72, 1.5);
  g.add(halo);

  // Make it a TALL wreck so it stays clearly above the ~1.6 m vault — the car is
  // the "can't jump over, change lanes" obstacle (unlike the low barricade).
  g.scale.y = 1.7;

  return {
    group: g,
    update(t) {
      /* static wreck, slightly tilted; red light softly pulses */
      g.rotation.z = 0.04;
      g.rotation.y = 0.06;
      halo.material.opacity = 0.75 + 0.25 * Math.sin(t * 4);
    },
    flash() {
      lower.material.emissive = new THREE.Color(COLORS.accent);
      lower.material.emissiveIntensity = 0.9;
      setTimeout(() => (lower.material.emissiveIntensity = 0), 90);
    },
  };
}

function makeBarricade() {
  const g = new THREE.Group();
  const boardMat = mat(0x8a5a2b, { roughness: 0.9 });
  const plank = (y, w) => {
    const p = box(w, 0.18, 0.12, boardMat);
    p.position.y = y;
    p.castShadow = true;
    g.add(p);
    return p;
  };
  plank(0.4, 2.2);
  plank(0.7, 2.2);
  plank(1.0, 2.2);
  // red/white striped caution board on top (low hurdle — cleared by a jump)
  const stripe = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const s = box(2.2 / n - 0.02, 0.34, 0.06, mat(i % 2 ? 0xd23b2f : 0xe8e3d8));
    s.position.x = -1.1 + (i + 0.5) * (2.2 / n);
    s.castShadow = true;
    stripe.add(s);
  }
  stripe.position.set(0, 1.25, 0);
  g.add(stripe);
  // posts
  for (const x of [-1.0, 1.0]) {
    const post = box(0.12, 1.45, 0.12, mat(0x2a2c30));
    post.position.set(x, 0.725, 0);
    post.castShadow = true;
    g.add(post);
  }
  return {
    group: g,
    update(t) {
      stripe.rotation.y = Math.sin(t * 0.6) * 0.0;
    },
    flash() {
      stripe.children.forEach((c) => (c.material.emissiveIntensity = 1.4));
      setTimeout(() => stripe.children.forEach((c) => (c.material.emissiveIntensity = 0)), 90);
    },
  };
}

function makeDrone() {
  const g = new THREE.Group();
  const body = box(1.1, 0.35, 0.5, mat(0x2a2e34, { metalness: 0.4, roughness: 0.5 }));
  body.castShadow = true;
  g.add(body);
  // camera eye
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  eye.position.set(0, 0, 0.28);
  g.add(eye);
  // four rotors
  const armMat = mat(0x1c1e22);
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x0d0e10, transparent: true, opacity: 0.7 });
  const rotors = [];
  for (const [x, z] of [[-0.6, 0.32], [0.6, 0.32], [-0.6, -0.32], [0.6, -0.32]]) {
    const arm = box(0.7, 0.06, 0.06, armMat);
    arm.position.set(x * 0.6, 0, z * 0.6);
    arm.rotation.y = Math.atan2(z, x);
    arm.castShadow = true;
    g.add(arm);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 16), rotorMat);
    disc.position.set(x, 0.06, z);
    g.add(disc);
    rotors.push(disc);
  }
  const glow = glowTexture({ inner: 'rgba(255,60,40,0.9)', outer: 'rgba(255,60,40,0)' });
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false }));
  beacon.scale.set(1.4, 1.4, 1);
  g.add(beacon);
  return {
    group: g,
    update(t) {
      // Height + forward close-in are owned by the core/renderer (obj.y), so we
      // only add life here: spin the rotors, lean as it darts in, pulse the beacon.
      g.rotation.z = Math.sin(t * 1.5) * 0.05;
      rotors.forEach((r, i) => (r.rotation.y = t * (20 + i)));
      const pulse = 0.6 + 0.4 * Math.sin(t * 8);
      beacon.material.opacity = pulse;
    },
    flash() {
      eye.material.color.set(0xffffff);
      setTimeout(() => eye.material.color.set(0xff3b30), 90);
    },
  };
}

// --- items -----------------------------------------------------------------

function itemBase(color, glowColor) {
  const halo = glowTexture({
    inner: glowColor,
    outer: 'rgba(0,0,0,0)',
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 2.4, 1);
  const grp = new THREE.Group();
  grp.add(sprite);
  return { grp, sprite, glow: color };
}

function makePhone() {
  const { grp, sprite } = itemBase(0x7fd6ff, BLUE_GLOW);
  const body = box(0.4, 0.72, 0.08, mat(0x111418, { metalness: 0.3, roughness: 0.4 }));
  const screen = box(0.32, 0.6, 0.02, new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
  screen.position.z = 0.05;
  grp.add(body, screen);
  return {
    group: grp,
    update(t) {
      grp.position.y = 1.0 + Math.sin(t * 2) * 0.12;
      grp.rotation.y = t * 0.8;
      sprite.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    },
    flash() {},
  };
}

function makeFlashlight() {
  const { grp, sprite } = itemBase(0xffe08a, BLUE_GLOW);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.6, 16), mat(0xd8dde4, { metalness: 0.5, roughness: 0.4 }));
  barrel.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.2, 16), mat(0x2a2e34));
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.4;
  grp.add(barrel, head);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beam.rotation.x = Math.PI / 2;
  beam.position.z = 1.2;
  grp.add(beam);
  return {
    group: grp,
    update(t) {
      grp.position.y = 1.0 + Math.sin(t * 2 + 1) * 0.12;
      grp.rotation.y = t * 0.8;
    },
    flash() {},
  };
}

function makeWater() {
  const { grp, sprite } = itemBase(0x8ad8ff, BLUE_GLOW);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 16), mat(0x9fd6ff, { transparent: true, opacity: 0.8, roughness: 0.2 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12), mat(0x2a6fd0));
  cap.position.y = 0.31;
  grp.add(bottle, cap);
  return {
    group: grp,
    update(t) {
      grp.position.y = 1.0 + Math.sin(t * 2 + 2) * 0.12;
      grp.rotation.y = t * 0.8;
    },
    flash() {},
  };
}

function makeFirstAid() {
  const { grp, sprite } = itemBase(0xff9a9a, BLUE_GLOW);
  const kit = box(0.7, 0.5, 0.35, mat(0xf2f2f2, { roughness: 0.6 }));
  grp.add(kit);
  // red cross
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  const v = box(0.14, 0.34, 0.02, crossMat);
  v.position.z = 0.19;
  const h = box(0.34, 0.14, 0.02, crossMat);
  h.position.z = 0.19;
  grp.add(v, h);
  return {
    group: grp,
    update(t) {
      grp.position.y = 1.0 + Math.sin(t * 2 + 3) * 0.12;
      grp.rotation.y = t * 0.8;
    },
    flash() {},
  };
}

const BUILDERS = {
  debris: makeDebris,
  car: makeCar,
  barricade: makeBarricade,
  drone: makeDrone,
  phone: makePhone,
  flashlight: makeFlashlight,
  water: makeWater,
  firstaid: makeFirstAid,
};

export function buildObject(type) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error('No mesh builder for type: ' + type);
  const obj = builder();
  obj.type = type;
  return obj;
}
