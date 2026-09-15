// Pure collision test between the player and a single object.
// The player occupies the centre of its lane at z = playerZ, standing on the
// road (y ≈ 0). An object collides when it is in the same lane, its z is
// within the player's collision window, AND the vertical bands overlap:
//   * player y      — feet height while jumping (0 = on the road)
//   * player crouch — head drops to CROUCH.headY, ducking under drones
//   * debris        — only hits once it has fallen into the body band
//   * drone         — hovers at flyY; a crouched player slips underneath
import { PLAYER, FALL, JUMP, CROUCH, TYPE_META, laneX } from './config.js';

export function objectsOverlap(player, obj) {
  if (player.invuln > 0) return false; // i-frames: no damage window
  if (obj.lane !== player.lane) return false;
  const dz = Math.abs(obj.z - player.z);
  if (dz > PLAYER.collisionZWindow) return false;

  const py = player.y ?? 0;
  const crouching = !!player.crouch;
  const meta = TYPE_META[obj.type] || {};

  if (meta.falling) {
    // Debris hits only once it has dropped into the player's height band,
    // unless the player has jumped clear above it.
    if (obj.y == null || obj.y > FALL.collisionY) return false;
    if (py > JUMP.minClearY) return false; // airborne over the chunk
  } else if (meta.flying) {
    if (obj.y != null && obj.y < 0.5) return false; // never below the road
    // Drones hover at head height. Jumping (or crouching) avoids them.
    if (py > JUMP.minClearY) return false;
    if (crouching && (obj.y ?? 0) > CROUCH.headY) return false; // ducked under it
  } else if (meta.jumpable) {
    // Low ground obstacles (barricades): clearable by jumping over them.
    if (py > JUMP.minClearY) return false;
  }
  // Cars and anything else: no vertical escape — lane + z decide.
  return true;
}

// Returns the first colliding hazard among a list (or null).
export function firstCollision(player, objects) {
  for (const o of objects) {
    if (o.hazard && objectsOverlap(player, o)) return o;
  }
  return null;
}

// Returns every collectible currently overlapping the player.
export function overlappingItems(player, objects) {
  return objects.filter((o) => o.item && objectsOverlap(player, o));
}

// Exported for tests / renderer convenience.
export const laneCenterX = laneX;
