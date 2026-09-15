// Score helpers. Distance-driven score plus per-item bonuses.
import { SCORE } from './config.js';

export const scoreForDistance = (distance) =>
  Math.max(0, Math.floor(distance * SCORE.perMeter));

// Milestones are whole multiples of SCORE.milestoneEvery.
export const nextMilestone = (distance) =>
  Math.floor(distance / SCORE.milestoneEvery + 1) * SCORE.milestoneEvery;

export { SCORE };
