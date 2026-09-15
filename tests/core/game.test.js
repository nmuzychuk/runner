import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../js/core/game.js';
import { LIVES } from '../../js/core/config.js';

describe('Game lifecycle', () => {
  let game;
  beforeEach(() => {
    game = new Game({ seed: 100 });
  });

  it('starts in the menu state', () => {
    expect(game.state).toBe('menu');
  });

  it('start() transitions to running and emits a start event', () => {
    game.start();
    expect(game.state).toBe('running');
    expect(game.events.some((e) => e.type === 'start')).toBe(true);
  });

  it('does not start when already running', () => {
    game.start();
    const before = game.events.length;
    game.start();
    expect(game.events.length).toBe(before);
  });

  it('move() changes lane only while running and clamps to bounds', () => {
    expect(game.move(1)).toBe(false); // menu
    game.start();
    expect(game.lane).toBe(1);
    expect(game.move(1)).toBe(true);
    expect(game.lane).toBe(2);
    expect(game.move(1)).toBe(false); // already at right edge
    expect(game.lane).toBe(2);
    game.move(-1);
    game.move(-1);
    expect(game.lane).toBe(0);
    expect(game.move(-1)).toBe(false); // left edge
  });

  it('step() advances distance while running', () => {
    game.start();
    const d0 = game.distance;
    game.step(1 / 60);
    expect(game.distance).toBeGreaterThan(d0);
  });

  it('step() is a no-op outside of running', () => {
    game.step(0.1); // menu
    expect(game.distance).toBe(0);
  });

  it('reset() restores initial state', () => {
    game.start();
    game.step(0.5);
    game.reset(200);
    expect(game.state).toBe('menu');
    expect(game.distance).toBe(0);
    expect(game.lives).toBe(LIVES.max);
    expect(game.objects).toHaveLength(0);
    expect(game.collected).toHaveLength(0);
  });
});

describe('Game hazards and death', () => {
  it('loses a life and enters gameover when lives reach zero', () => {
    const game = new Game({ seed: 1 });
    game.start();
    // Force the player to collide: place a hazard in the player's lane at z=0.
    game.objects.push({ id: 9999, type: 'car', lane: game.lane, z: 0, hazard: true, item: false, collected: false });
    game.invuln = 0;
    game.lives = 1;
    const events = game.step(1 / 60);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(game.lives).toBe(0);
    expect(game.state).toBe('gameover');
  });

  it('infiniteLives mode: hazards never reduce lives or end the game', () => {
    const game = new Game({ seed: 1, infiniteLives: true });
    game.start();
    game.lives = 1; // would normally be enough to die on the next hit
    for (let i = 0; i < 5; i++) {
      game.objects.push({ id: 9000 + i, type: 'car', lane: game.lane, z: 0, hazard: true, item: false, collected: false });
      game.invuln = 0;
      game.step(1 / 60);
    }
    expect(game.lives).toBe(1);
    expect(game.state).toBe('running');
  });

  it('collects an overlapping item and applies its bonus', () => {
    const game = new Game({ seed: 1 });
    game.start();
    const bonusBefore = game.bonus;
    game.objects.push({ id: 8888, type: 'water', lane: game.lane, z: 0, hazard: false, item: true, collected: false });
    game.invuln = 0;
    game.step(1 / 60);
    expect(game.collected).toContain('water');
    expect(game.bonus).toBeGreaterThan(bonusBefore);
  });

  it('firstaid heals by one life (capped at max)', () => {
    const game = new Game({ seed: 1 });
    game.start();
    game.lives = 1;
    game.objects.push({ id: 7777, type: 'firstaid', lane: game.lane, z: 0, hazard: false, item: true, collected: false });
    game.invuln = 0;
    game.step(1 / 60);
    expect(game.lives).toBe(2); // +1 heal

    // capped at max
    const g2 = new Game({ seed: 1 });
    g2.start();
    g2.lives = LIVES.max;
    g2.objects.push({ id: 7778, type: 'firstaid', lane: g2.lane, z: 0, hazard: false, item: true, collected: false });
    g2.invuln = 0;
    g2.step(1 / 60);
    expect(g2.lives).toBe(LIVES.max);
  });

  it('a full run with a fixed seed is reproducible', () => {
    const run = (seed) => {
      const g = new Game({ seed });
      g.start();
      for (let i = 0; i < 300 && g.state === 'running'; i++) {
        g.step(1 / 60);
      }
      return {
        distance: g.distance,
        lives: g.lives,
        collected: g.collected,
        objects: g.objects.map((o) => o.lane),
      };
    };
    expect(run(555)).toEqual(run(555));
  });
});

describe('pause / resume', () => {
  it('running -> paused emits a pause event', () => {
    const g = new Game({ seed: 1 });
    g.start();
    expect(g.pause()).toBe(true);
    expect(g.state).toBe('paused');
    expect(g.events.some((e) => e.type === 'pause')).toBe(true);
  });

  it('paused -> running emits a resume event', () => {
    const g = new Game({ seed: 1 });
    g.start();
    g.pause();
    expect(g.pause()).toBe(true);
    expect(g.state).toBe('running');
    expect(g.events.some((e) => e.type === 'resume')).toBe(true);
  });

  it('pause is a no-op in menu and gameover', () => {
    const g = new Game({ seed: 1 });
    expect(g.pause()).toBe(false);
    expect(g.state).toBe('menu');

    g.start();
    // Force game-over: single life + a hazard in the player's lane.
    g.lives = 1;
    g.invuln = 0;
    g.objects.push({ id: 42, type: 'car', lane: g.lane, z: 0, hazard: true, item: false, collected: false });
    g.step(1 / 60);
    expect(g.state).toBe('gameover');
    expect(g.pause()).toBe(false);
    expect(g.state).toBe('gameover');
  });

  it('step() does nothing while paused', () => {
    const g = new Game({ seed: 1 });
    g.start();
    g.step(1 / 60);
    const d1 = g.distance;
    g.pause();
    const events = g.step(5); // a "long frame" that must be ignored
    expect(events).toEqual([]);
    expect(g.distance).toBe(d1);
  });
});

// step() clamps dt to 50 ms, so advance a duration in 50 ms chunks.
const advance = (g, seconds) => {
  const dt = 0.05;
  let remaining = seconds;
  while (remaining > 0) {
    const d = Math.min(dt, remaining);
    g.step(d);
    remaining -= d;
  }
};

describe('jump / crouch', () => {
  it('jump() lifts the player (y > 0) and decays back to the ground', () => {
    const g = new Game({ seed: 1 });
    g.start();
    expect(g.player().y).toBe(0);
    expect(g.jump()).toBe(true);
    expect(g.player().y).toBeGreaterThan(0);
    advance(g, 1.2); // longer than JUMP.duration
    expect(g.player().y).toBe(0);
  });

  it('cannot re-jump mid-air', () => {
    const g = new Game({ seed: 1 });
    g.start();
    g.jump();
    expect(g.jump()).toBe(false);
  });

  it('crouch() flags the player while the timer lasts', () => {
    const g = new Game({ seed: 1 });
    g.start();
    expect(g.player().crouch).toBe(false);
    expect(g.crouch()).toBe(true);
    expect(g.player().crouch).toBe(true);
    advance(g, 1.2); // longer than CROUCH.duration
    expect(g.player().crouch).toBe(false);
  });

  it('crouch is blocked mid-jump; jump cancels a crouch', () => {
    const g = new Game({ seed: 1 });
    g.start();
    g.jump();
    expect(g.crouch()).toBe(false); // airborne: no ducking

    const g2 = new Game({ seed: 2 });
    g2.start();
    g2.crouch();
    expect(g2.jump()).toBe(true); // leaping up cancels the duck
    expect(g2.player().crouch).toBe(false);
  });

  it('jump() and crouch() are no-ops outside the running state', () => {
    const g = new Game({ seed: 1 });
    expect(g.jump()).toBe(false);
    expect(g.crouch()).toBe(false);
  });
});
