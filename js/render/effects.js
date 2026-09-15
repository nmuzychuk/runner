// World-space FX: explosion bursts, collect sparkles, screen shake, hit flash.
// Cheap, pooled sprites. Exposes .hit(pos), .collect(pos), .update(dt),
// .shakeOffset() (for camera) and .flashLevel (0..1 for HUD overlay).
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,220,160,1)');
  grd.addColorStop(0.4, 'rgba(255,120,60,0.85)');
  grd.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Neutral smoke puff — a soft grey radial blob (tinted per-sprite at use).
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.flash = 0;
    this._tex = glowTexture();
    this._smokeTex = smokeTexture();
    this._pool = [];
  }

  _puff(pos, color, size, life, grow, tex = this._tex, rise = 2.0) {
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false }),
    );
    spr.position.copy(pos);
    spr.scale.set(size, size, 1);
    this.scene.add(spr);
    this._pool.push({ sprite: spr, life, max: life, grow, rise });
  }

  // Debris impact: a low, slow grey dust/smoke cloud on the road.
  smoke(pos) {
    for (let i = 0; i < 6; i++) {
      const off = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        Math.random() * 0.4,
        (Math.random() - 0.5) * 1.0,
      );
      const grey = i % 2 ? 0x9aa0a6 : 0x6a7076;
      this._puff(pos.clone().add(off), grey, 0.7 + Math.random() * 0.9, 0.7 + Math.random() * 0.5, 2.6, this._smokeTex, 1.2);
    }
    // A little shake so the impact feels physical, but weaker than a hit.
    this.shake = Math.min(1, this.shake + 0.15);
  }

  hit(pos) {
    this.shake = Math.min(1, this.shake + 0.9);
    this.flash = Math.min(1, this.flash + 0.7);
    for (let i = 0; i < 6; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 1);
      this._puff(pos.clone().add(off), 0xffb060, 1 + i * 0.5, 0.6, 2.5);
    }
  }

  collect(pos) {
    this.flash = Math.min(0.5, this.flash + 0.25);
    for (let i = 0; i < 5; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.2, 0);
      this._puff(pos.clone().add(off), 0x7fd6ff, 0.8 + i * 0.35, 0.55, 3);
    }
  }

  shakeOffset() {
    if (this.shake <= 0) return new THREE.Vector3();
    const s = this.shake;
    return new THREE.Vector3(
      (Math.random() - 0.5) * s * 0.6,
      (Math.random() - 0.5) * s * 0.4,
      0,
    );
  }

  get flashLevel() {
    return this.flash;
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (let i = this._pool.length - 1; i >= 0; i--) {
      const p = this._pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this._pool.splice(i, 1);
      } else {
        const k = 1 - p.life / p.max;
        const s = 0.6 + k * p.grow;
        p.sprite.scale.set(s, s, 1);
        p.sprite.material.opacity = p.life / p.max;
        p.sprite.position.y += dt * (p.rise ?? 2.0); // rise
      }
    }
  }
}
