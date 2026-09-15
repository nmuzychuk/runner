import { describe, it, expect } from 'vitest';
import { scoreForDistance, nextMilestone, SCORE } from '../../js/core/score.js';

describe('scoreForDistance', () => {
  it('scales linearly with distance (1 per metre)', () => {
    expect(scoreForDistance(0)).toBe(0);
    expect(scoreForDistance(50)).toBe(50);
    expect(scoreForDistance(123.7)).toBe(123);
  });

  it('clamps negative distance to zero', () => {
    expect(scoreForDistance(-10)).toBe(0);
  });
});

describe('nextMilestone', () => {
  it('returns the next multiple of milestoneEvery', () => {
    expect(nextMilestone(0)).toBe(SCORE.milestoneEvery);
    expect(nextMilestone(499)).toBe(500);
    expect(nextMilestone(500)).toBe(1000);
    expect(nextMilestone(1200)).toBe(1500);
  });
});
