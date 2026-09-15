// The game "brain". Pure JS: given a dt it advances the world, spawns hazards,
// resolves collisions and exposes everything the renderer/HUD need. It knows
// nothing about three.js — objects are plain {id,type,lane,z,hazard,item}.
import {
  LANES,
  LIVES,
  PLAYER,
  SPAWN,
  SCORE,
  TYPE_META,
  FALL,
  JUMP,
  CROUCH,
  DRONE_AHEAD_SPEED,
  speedFor,
} from './config.js';
import { Spawner } from './spawner.js';
import { firstCollision, overlappingItems } from './collision.js';
import { scoreForDistance } from './score.js';

let NEXT_ID = 1;

const makeObject = (d, playerZ) => {
  const meta = TYPE_META[d.type] || {};
  // Debris spawns closer (FALL.aheadDebris) so it lands on the road in front of
  // the player; everything else spawns the standard distance ahead.
  const ahead = meta.falling ? FALL.aheadDebris : SPAWN.ahead;
  return {
    id: NEXT_ID++,
    type: d.type,
    lane: d.lane,
    z: playerZ + ahead,
    // Airborne hazards carry a vertical position. Debris starts in the sky
    // and falls; drones hover at their flight altitude. Ground objects stay
    // at y = 0 (the road).
    y: meta.falling ? FALL.startY : meta.flying ? (meta.flyY ?? 1.6) : 0,
    hazard: !!TYPE_META[d.type]?.hazard,
    item: !!TYPE_META[d.type]?.item,
    collected: false,
    // Falling debris: set true on the frame it hits the road, so step() can
    // emit a one-shot `debris_land` event (impact sound + smoke in the shell).
    landed: meta.falling ? false : undefined,
  };
};

const clampLane = (l) => Math.max(0, Math.min(LANES - 1, l));

export class Game {
  constructor({ seed = 1, playerZ = 0, infiniteLives = false } = {}) {
    this.playerZ = playerZ;
    this.seed = seed;
    this.infiniteLives = infiniteLives;
    this._resetInternal();
    this.state = 'menu';
  }

  _resetInternal() {
    this.spawner = new Spawner({ seed: this.seed });
    this.lane = 1; // start in the centre lane
    this.distance = 0;
    this.speed = 0;
    this.lives = LIVES.max;
    this.invuln = 0;
    this.jumpT = 0; // remaining jump arc seconds (0 = on the ground)
    this.crouchT = 0; // remaining crouch seconds (0 = standing)
    this.objects = [];
    this.collected = []; // item types picked up this run
    this.bonus = 0;
    this.bestMilestone = 0;
    this.events = []; // transient notifications for the renderer
  }

  // ---- public API used by main.js ----------------------------------------

  get score() {
    return scoreForDistance(this.distance) + this.bonus;
  }

  player() {
    // Feet height above the road: a smooth parabola over JUMP.duration so the
    // renderer and the collision check agree on when the player is airborne.
    // While airborne the player is always at least JUMP.minClearY high, so a
    // jump is effective from the very first frame (low obstacles cleared).
    let y = 0;
    if (this.jumpT > 0) {
      const p = 1 - this.jumpT / JUMP.duration; // 0..1 over the arc
      y = Math.max(JUMP.minClearY, JUMP.height * 4 * p * (1 - p));
    }
    return {
      lane: this.lane,
      z: this.playerZ,
      invuln: this.invuln,
      y,
      crouch: this.crouchT > 0,
    };
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this._resetInternal();
    this.state = 'menu';
  }

  start() {
    if (this.state === 'menu' || this.state === 'gameover') {
      this.state = 'running';
      this.events.push({ type: 'start' });
    }
  }

  // Toggle pause. Only valid while running; resume goes back to 'running'.
  pause() {
    if (this.state === 'running') {
      this.state = 'paused';
      this.events.push({ type: 'pause' });
      return true;
    }
    if (this.state === 'paused') {
      this.state = 'running';
      this.events.push({ type: 'resume' });
      return true;
    }
    return false;
  }

  // dir: -1 = left, +1 = right
  move(dir) {
    if (this.state !== 'running') return false;
    const next = clampLane(this.lane + dir);
    if (next === this.lane) return false;
    this.lane = next;
    this.events.push({ type: 'move', lane: this.lane });
    return true;
  }

  // Jump: a fixed arc of JUMP.duration seconds, airborne from the first
  // frame (can't re-jump mid-air). Clears low obstacles (debris, barricade).
  jump() {
    if (this.state !== 'running' || this.jumpT > 0) return false;
    this.jumpT = JUMP.duration;
    this.crouchT = 0; // you can't duck and jump at once
    this.events.push({ type: 'jump' });
    return true;
  }

  // Crouch: ducks for CROUCH.duration seconds; holding the key refreshes it.
  crouch() {
    if (this.state !== 'running') return false;
    if (this.jumpT > 0) return false; // landing first
    this.crouchT = CROUCH.duration;
    this.events.push({ type: 'crouch' });
    return true;
  }

  // Advance the simulation by dt seconds. Returns a (possibly empty) event list.
  step(dt) {
    if (this.state !== 'running') return [];
    dt = Math.min(dt, 0.05); // clamp huge frame gaps (tab switch)
    this.events = [];

    this.speed = speedFor(this.distance);
    const travel = this.speed * dt;
    this.distance += travel;
    this.invuln = Math.max(0, this.invuln - dt);
    // Vertical actions decay (a held crouch key re-arms via crouch() in the
    // input loop, so holding keeps the timer topped up).
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.crouchT = Math.max(0, this.crouchT - dt);

    // Move everything toward the player (world scrolls past the fixed player).
    // Drones additionally close on the player at a fixed extra speed so they
    // feel like they're actively hunting rather than just being passed.
    for (const o of this.objects) {
      o.z -= travel;
      const meta = TYPE_META[o.type] || {};
      if (meta.falling) {
        const wasAirborne = o.y > 0;
        o.y = Math.max(0, o.y - FALL.speed * dt);
        // The frame the debris first touches the road: one-shot impact event.
        if (wasAirborne && o.y === 0 && o.landed !== true) {
          o.landed = true;
          this.events.push({ type: 'debris_land', lane: o.lane, z: o.z });
        }
      } else if (meta.flying) o.z -= DRONE_AHEAD_SPEED * dt;
    }

    // Spawn any waves that are now due.
    for (const d of this.spawner.update(this.distance)) {
      this.objects.push(makeObject(d, this.playerZ));
    }

    const player = this.player();

    // Pickups.
    for (const it of overlappingItems(player, this.objects)) this._collect(it);

    // Hazards.
    const hit = firstCollision(player, this.objects);
    if (hit) this._hit(hit);

    // Cull objects that have passed behind the player.
    this.objects = this.objects.filter(
      (o) => o.z > this.playerZ - SPAWN.despawnBehind,
    );

    // Score milestones (whole multiples of SCORE.milestoneEvery).
    const sc = this.score;
    while (this.bestMilestone + SCORE.milestoneEvery <= sc) {
      this.bestMilestone += SCORE.milestoneEvery;
      this.events.push({ type: 'milestone', score: sc });
    }

    if (this.lives <= 0 && !this.infiniteLives) this.state = 'gameover';
    return this.events;
  }

  // ---- internal -----------------------------------------------------------

  _collect(it) {
    const meta = TYPE_META[it.type] || {};
    it.collected = true;
    this.collected.push(it.type);
    this.bonus += meta.bonus || 0;
    if (meta.heal) this.lives = Math.min(LIVES.max, this.lives + meta.heal);
    this.objects = this.objects.filter((o) => o !== it);
    this.events.push({
      type: 'collect',
      item: it.type,
      bonus: meta.bonus || 0,
      score: this.score,
    });
  }

  _hit(hz) {
    if (this.infiniteLives) {
      // Dev-only: flash + i-frames but never lose a life. Keeps the run
      // going for stable screenshot / MCP verification.
      this.invuln = PLAYER.invulnTime;
      this.events.push({ type: 'hit', hazard: hz.type, lives: this.lives });
      return;
    }
    this.lives -= 1;
    this.invuln = PLAYER.invulnTime;
    this.events.push({ type: 'hit', hazard: hz.type, lives: this.lives });
  }
}
