import { test, expect } from '@playwright/test';

// The app exposes `window.__game` (the core Game instance) so tests can assert
// on real game state rather than only on the DOM.

test.describe('Air Raid Runner', () => {
  test('loads and shows the start overlay', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');

    await expect(page.getByTestId('overlay')).toBeVisible();
    await expect(page.getByTestId('start-btn')).toBeVisible();
    await expect(page.getByTestId('hud')).toBeVisible();

    // The debug hook must be present (proves main.js + three import map loaded).
    const hasGame = await page.evaluate(() => !!window.__game);
    expect(hasGame).toBe(true);

    // No fatal script errors.
    expect(errors).toEqual([]);
  });

  test('starting transitions to running and advances the score', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-btn').click();

    // Overlay hides, game state is running.
    await expect(page.getByTestId('overlay')).toHaveClass(/hidden/);
    const state = await page.evaluate(() => window.__game.state);
    expect(state).toBe('running');

    // Let the game run for a couple of seconds; distance/score must increase.
    await page.waitForTimeout(1500);
    const distance = await page.evaluate(() => window.__game.distance);
    const score = await page.evaluate(() => window.__game.score);
    expect(distance).toBeGreaterThan(0);
    expect(score).toBeGreaterThan(0);

    const hudDistance = await page.getByTestId('distance').textContent();
    expect(hudDistance).toMatch(/\d+ m/);
  });

  test('arrow keys change the player lane', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-btn').click();

    const lane = () => page.evaluate(() => window.__game.lane);

    const startLane = await lane(); // 1 (centre)
    await page.keyboard.press('ArrowRight');
    await expect.poll(lane).toBe(startLane + 1);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(lane).toBe(Math.max(0, startLane - 2));
  });

  test('taking three hits ends the game and restart works', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-btn').click();

    // Force collisions by dropping a hazard into the player's lane and stepping.
    const hit = () =>
      page.evaluate(() => {
        const g = window.__game;
        if (g.state !== 'running') return;
        g.invuln = 0;
        g.objects.push({
          id: Math.random() * 1e9,
          type: 'car',
          lane: g.lane,
          z: g.playerZ,
          hazard: true,
          item: false,
          collected: false,
        });
        g.step(1 / 60);
        return g.state;
      });

    // Three hits should take lives 3 -> 0 and flip to gameover.
    await expect.poll(hit, { timeout: 5000 }).toBe('gameover');

    await expect(page.getByTestId('overlay')).toBeVisible();
    expect(await page.getByTestId('overlay-title').textContent()).toMatch(/caught/i);

    // Restart resets and runs again.
    await page.getByTestId('start-btn').click();
    await expect(page.getByTestId('overlay')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => window.__game.state)).toBe('running');
    expect(await page.evaluate(() => window.__game.lives)).toBe(3);
  });

  test('switching back and forth is clamped to lane bounds', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-btn').click();

    // Push right repeatedly; lane must cap at 2.
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.__game.lane)).toBe(2);

    // Push left repeatedly; lane must floor at 0.
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.__game.lane)).toBe(0);
  });
});
