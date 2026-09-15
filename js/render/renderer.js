// Renderer: owns the three.js scene, camera, lights, and per-object meshes.
// Each frame the app calls renderer.sync(game, dt, t). It:
//   - scrolls the street by the distance travelled,
//   - reconciles object meshes with game.objects (add/remove by id),
//   - animates the player, and
//   - applies camera shake + renders.
import * as THREE from 'three';
import { COLORS } from './palette.js';
import { Track } from './track.js';
import { Player } from './player.js';
import { buildObject } from './objects.js';
import { Effects } from './effects.js';
import { laneX } from '../core/config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // Shadows: soft PCF so drones/barricades/car/soldier cast readable ground
    // shadows (the drone in particular is easy to miss against the sky).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.fog ?? COLORS.sky, 30, 120);

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
    this.camera.position.set(0, 4.4, -7);
    this.camera.lookAt(0, 1.6, 12);

    // Lights — bright, smoky-dusk raid atmosphere. The key light is a warm
    // directional "moon/sun" that also carries the shadow map.
    this.scene.add(new THREE.HemisphereLight(0x8295ad, 0x3a3a30, 1.7));

    const sun = new THREE.DirectionalLight(0xffd9a0, 1.5);
    sun.position.set(-6, 14, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // The street runs along +z ahead of the player (camera at z=-7). Orient the
    // shadow frustum down -z→+z so it covers the road + obstacles the player is
    // about to meet. A directional light's shadow camera looks from `position`
    // toward `target`; keep the target at the near play zone.
    sun.target.position.set(0, 0, 20);
    this.scene.add(sun.target);
    const sc = sun.shadow.camera;
    sc.near = 0.5;
    sc.far = 70;
    sc.left = -14;
    sc.right = 14;
    sc.top = 30;
    sc.bottom = -6;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x4a6ea0, 0.7);
    rim.position.set(4, 6, 8);
    this.scene.add(rim);

    this.track = new Track(this.scene, { seed: 7 });
    this.player = new Player();
    this.scene.add(this.player.group);
    this.effects = new Effects(this.scene);

    this._meshes = new Map(); // game object id -> {handle, group, baseY}
    this._lastDistance = 0;
    this._lastInvuln = -1;
    this._v3 = new THREE.Vector3(); // reused by _worldPos to avoid per-frame GC churn
    this._resize();
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // World-space position for a game object. Height comes from obj.y (the core
  // drives it for falling debris + flying drones; ground objects are 0). Items
  // re-set their own height in update(), so this is just the spawn placement.
  _worldPos(obj) {
    // Reuses a single cached vector — callers consume it immediately, so the
    // shared instance is safe and this avoids allocating one per object/frame.
    return this._v3.set(laneX(obj.lane), obj.y ?? 0, obj.z);
  }

  _addMesh(obj) {
    const handle = buildObject(obj.type);
    handle.group.position.copy(this._worldPos(obj));
    this.scene.add(handle.group);
    this._meshes.set(obj.id, { handle, baseY: obj.y ?? 0 });
  }

  _removeMesh(id) {
    const rec = this._meshes.get(id);
    if (!rec) return;
    this.scene.remove(rec.handle.group);
    // Dispose every geometry + material of the despawned object. Materials
    // are deduped (a car shares one paint/tire material across many meshes)
    // so each is disposed exactly once. buildObject() always allocates fresh
    // materials per object, so nothing shared with other objects is touched.
    const mats = new Set();
    rec.handle.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && mats.add(m));
    });
    for (const m of mats) this._disposeMaterial(m);
    this._meshes.delete(id);
  }

  _disposeMaterial(m) {
    if (m && m.map) m.map.dispose();
    if (m) m.dispose();
  }

  sync(game, dt, t) {
    const travel = game.distance - this._lastDistance;
    this._lastDistance = game.distance;

    // Street scroll
    this.track.update(Math.max(0, travel), t);

    // Player
    const pl = game.player();
    this.player.setLaneX(laneX(game.lane));
    this.player.group.position.y = pl.y;          // jump arc
    this.player.setCrouch(pl.crouch);            // duck pose
    const speed01 = THREE.MathUtils.clamp((game.speed - 13) / (34 - 13), 0, 1);
    this.player.update(t, game.state === 'running' ? 0.4 + speed01 * 0.6 : 0.2);
    if (game.invuln !== this._lastInvuln) {
      this.player.showInvuln(game.invuln > 0);
      this._lastInvuln = game.invuln > 0;
    }

    // Reconcile object meshes
    const seen = new Set();
    for (const obj of game.objects) {
      seen.add(obj.id);
      let rec = this._meshes.get(obj.id);
      if (!rec) this._addMesh(obj);
      else {
        rec = this._meshes.get(obj.id);
        const p = this._worldPos(obj); // x/y/z — y is obj.y (core-driven)
        rec.handle.group.position.x = p.x;
        rec.handle.group.position.y = p.y;
        rec.handle.group.position.z = p.z;
      }
      const r = this._meshes.get(obj.id);
      r.handle.update(t);
    }
    for (const id of [...this._meshes.keys()]) {
      if (!seen.has(id)) this._removeMesh(id);
    }

    // Effects
    for (const ev of game.events) {
      if (ev.type === 'hit') {
        this.player.hitFlash();
        this.effects.hit(new THREE.Vector3(laneX(ev.lane ?? game.lane), 0.6, 0.5));
      } else if (ev.type === 'collect') {
        this.effects.collect(new THREE.Vector3(laneX(ev.lane ?? game.lane), 0.8, 0.5));
      } else if (ev.type === 'debris_land') {
        // Debris just hit the road: grey dust/smoke at the landing spot.
        this.effects.smoke(new THREE.Vector3(laneX(ev.lane), 0.15, ev.z));
      }
    }
    game.events.length = 0;
    this.effects.update(dt);

    // Camera base + shake
    const shake = this.effects.shakeOffset();
    this.camera.position.set(shake.x, 4.4 + shake.y, -7);
    this.camera.lookAt(shake.x, 1.6, 12);

    this.renderer.render(this.scene, this.camera);
  }

  // Returns 0..1 white flash for a HUD overlay.
  get flash() {
    return this.effects.flashLevel;
  }
}
