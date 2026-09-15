// A rigged, textured human (the three.js "Soldier" sample model) driven by its
// baked animation clips (Run / Idle). Replaces the old hand-built block figure.
// The public API is unchanged so renderer.js needs no changes:
//   .group, .setLaneX(x), .update(t, speed01), .setCrouch(v),
//   .hitFlash(), .showInvuln(v)
//
// Crouch is synthesized (the model has no crouch clip): the body is squashed
// toward the feet while the run clip cross-fades down to the idle clip. Jump
// height (pl.y) is applied to .group by the renderer, so it composes with the
// crouch squash — a crouched jump just starts from a lower base.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';

const MODEL_URL = 'vendor/Soldier.glb';
const MODEL_SCALE = 1.7;       // big runner style; ~1/3 of screen height
const HIT_FLASH_MS = 0.22;     // red emissive flash duration (seconds)
const INVULN_EMISSIVE = new THREE.Color(0x2a4a6a);
const INVULN_INTENSITY = 0.55;

// Green suit tint. The Soldier's body is a single textured mesh whose texture
// already varies in brightness per body part (dark boots, lighter torso), so
// multiplying by green yields different green shades across the suit. The visor
// gets its own, deeper green. A soft green emissive lifts it out of the dark.
const BODY_GREEN = new THREE.Color(0x8fbf52);
const VISOR_GREEN = new THREE.Color(0x5a9e30);
const BASE_EMISSIVE = new THREE.Color(0x1c2e08);
const BASE_EMISSIVE_INT = 0.7;

// Fallback body shown only if the GLB fails to load, so the player never
// disappears.
function _fallbackBody() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x6a7a58, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), m);
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), m);
  head.position.y = 1.5;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 8), m);
  legL.position.set(0.13, 0.35, 0);
  const legR = legL.clone(); legR.position.x = -0.13;
  g.add(torso, head, legL, legR);
  return g;
}

export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(MODEL_SCALE);
    this.group.add(this.inner);
    this.group.visible = true;

    this._targetX = 0;
    this._crouch = 0;          // 0 standing … 1 fully crouched
    this._crouchTarget = 0;
    this._hitFlash = 0;
    this._invuln = false;

    // Animation state (populated once the model loads)
    this._mixer = null;
    this._idle = null;
    this._run = null;
    this._ready = false;

    // Materials (for hit-flash / invuln) — filled in _onModel
    this._matSet = null;
    this._flashSaved = null;   // per-mat [emissiveHex, intensity] snapshot
    this._flashRestorePending = false;
    this._baseEmissiveHex = 0x000000;      // set once the model loads
    this._baseEmissiveIntensity = 0;

    this._loadModel();
  }

  _loadModel() {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => this._onModel(gltf),
      undefined,
      (err) => {
        console.warn('[Player] Soldier model failed to load — using fallback', err);
        this.inner.add(_fallbackBody());
      },
    );
  }

  _onModel(gltf) {
    const model = gltf.scene;
    model.rotation.y = Math.PI;   // Soldier faces +z by default; turn its back to the camera
    // Cast + receive shadows so the soldier grounds itself on the road.
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.inner.add(model);

    this._mixer = new THREE.AnimationMixer(model);
    const find = (name) => gltf.animations.find((a) => a.name === name);
    const idleClip = find('Idle') || find('TPose') || gltf.animations[0];
    const runClip = find('Run') || find('Walk') || gltf.animations[0];
    this._idle = this._mixer.clipAction(idleClip);
    this._run = this._mixer.clipAction(runClip);
    this._idle.setLoop(THREE.LoopRepeat);
    this._run.setLoop(THREE.LoopRepeat);
    this._idle.timeScale = 0.6;
    this._run.timeScale = 1.0;
    this._idle.play();
    this._run.play();
    this._run.setEffectiveWeight(0);
    this._ready = true;

    // Collect material instances once for hit-flash / invuln styling.
    const set = new Set();
    model.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m) set.add(m);
      }
    });
    this._matSet = set;

    // Tint the suit green (per-part shading preserved from the texture) and add
    // a soft green emissive lift so it reads against the dark raid scene.
    for (const m of set) {
      m.color.copy(m.name === 'Vanguard_VisorMat' ? VISOR_GREEN : BODY_GREEN);
      m.emissive.copy(BASE_EMISSIVE);
      m.emissiveIntensity = BASE_EMISSIVE_INT;
    }
    this._baseEmissiveHex = BASE_EMISSIVE.getHex();
    this._baseEmissiveIntensity = BASE_EMISSIVE_INT;
  }

  setLaneX(x) { this._targetX = x; }
  setCrouch(v) { this._crouchTarget = v ? 1 : 0; }

  // Red emissive flash; composes with the invuln glow and then restores.
  hitFlash() {
    this._hitFlash = HIT_FLASH_MS;
    if (!this._matSet) return;
    if (this._flashRestorePending) {
      this._flashRestorePending = false;
      this._applyEmissive(0x000000, this._invuln ? INVULN_INTENSITY : 0);
    }
    this._flashSaved = [];
    for (const m of this._matSet) this._flashSaved.push([m.emissive.getHex(), m.emissiveIntensity]);
    this._applyEmissive(0xff2211, 1.0);
    this._flashRestorePending = true;
  }

  _applyEmissive(hex, intensity) {
    if (!this._matSet) return;
    const c = new THREE.Color(hex);
    for (const m of this._matSet) { m.emissive.copy(c); m.emissiveIntensity = intensity; }
  }

  showInvuln(v) {
    if (v === this._invuln) return;
    this._invuln = v;
    if (!this._matSet) return;
    if (v) this._applyEmissive(0x2a4a6a, INVULN_INTENSITY);
    else if (!this._flashRestorePending)
      this._applyEmissive(this._baseEmissiveHex, this._baseEmissiveIntensity);
  }

  update(t, speed01 = 1) {
    this.group.position.x += (this._targetX - this.group.position.x) * 0.25;

    // Crouch blend drives a body squash + run→idle crossfade.
    this._crouch += (this._crouchTarget - this._crouch) * 0.22;
    const c = this._crouch;
    const base = MODEL_SCALE;
    this.inner.scale.set(
      base * (1 - 0.12 * c),
      base * (1 - 0.4 * c),
      base * (1 - 0.12 * c),
    );
    this.inner.position.y = 0.3 * c;   // keep the feet near the ground as the body shortens

    if (this._ready && this._mixer) {
      this._mixer.update(1 / 60);
      // Keep the run animation playing even while crouching (the crouch is a
      // pure body squash on top of the run clip — the legs still pump). Only the
      // speed scales the blend toward the idle clip when we are (near) stopped.
      const runW = 0.55 + 0.45 * Math.min(1, speed01);
      this._run.setEffectiveWeight(THREE.MathUtils.clamp(runW, 0, 1));
      this._idle.setEffectiveWeight(THREE.MathUtils.clamp(1 - runW, 0, 1));
    }

    if (this._hitFlash > 0) {
      this._hitFlash -= 1 / 60;
      if (this._hitFlash <= 0 && this._flashRestorePending) {
        this._flashRestorePending = false;
        this._restoreFlash();
      }
    }
  }

  _restoreFlash() {
    if (!this._flashSaved || !this._matSet) return;
    let i = 0;
    for (const m of this._matSet) {
      const s = this._flashSaved[i++];
      if (s) { m.emissive.setHex(s[0]); m.emissiveIntensity = s[1]; }
    }
    this._flashSaved = null;
  }
}
