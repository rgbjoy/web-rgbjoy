// Lens space matches glassPoint.frag: the screen spans -aspect…aspect across
// and -1…1 up, so the screen height is 2.

export const GRID_COLS = 5;
export const GRID_ROWS = 3;
export const POINT_COUNT = GRID_COLS * GRID_ROWS;

const GRID_MARGIN = 0.9;
/** The frame the grid is laid out in; keep in sync with glassPoint.frag. */
const FRAME_HALF_Y = 0.62;
const FRAME_BLEED = 0.06;

/** Spring back home at ~1Hz, a little under-damped so the points wobble as they settle. */
const SPRING = 38;
const DAMPING = 7;
/** The pointer pushes points within this radius, hardest up close. */
export const REPEL_RADIUS = 0.55;
const REPEL_STRENGTH = 40;
/** Small fixed steps keep the springs stable however long a frame takes. */
const MAX_STEP = 1 / 120;
const MAX_FRAME = 1 / 30;

export type Vec = { x: number; y: number };
export type LensPoint = Vec & { vx: number; vy: number };
export type Pointer = Vec & { active: boolean };

/** Row-major, bottom row first — the order the shader's per-point phase follows. */
export function gridHomes(aspect: number): Vec[] {
  const spanX = (aspect * 0.5 + FRAME_BLEED * 0.5) * GRID_MARGIN * 2;
  const spanY = (FRAME_HALF_Y + FRAME_BLEED * 0.25) * GRID_MARGIN * 2;
  const homes: Vec[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      homes.push({
        x: (col / (GRID_COLS - 1) - 0.5) * spanX,
        y: (row / (GRID_ROWS - 1) - 0.5) * spanY,
      });
    }
  }
  return homes;
}

export function restingPoints(homes: Vec[]): LensPoint[] {
  return homes.map(({ x, y }) => ({ x, y, vx: 0, vy: 0 }));
}

/** Advances every point by `delta` seconds: spring home, pushed away from an active pointer. */
export function stepPoints(points: LensPoint[], homes: Vec[], pointer: Pointer, delta: number) {
  let remaining = Math.min(Math.max(delta, 0), MAX_FRAME);
  while (remaining > 1e-6) {
    const h = Math.min(remaining, MAX_STEP);
    remaining -= h;
    points.forEach((point, i) => {
      let ax = SPRING * (homes[i].x - point.x) - DAMPING * point.vx;
      let ay = SPRING * (homes[i].y - point.y) - DAMPING * point.vy;
      if (pointer.active) {
        let dx = point.x - pointer.x;
        let dy = point.y - pointer.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 1e-4) {
          // Directly underneath: nudge it sideways so it doesn't stall at full force.
          dx = 1e-4;
          dy = 0;
          distance = 1e-4;
        }
        if (distance < REPEL_RADIUS) {
          const falloff = 1 - distance / REPEL_RADIUS;
          const push = (REPEL_STRENGTH * falloff * falloff) / distance;
          ax += dx * push;
          ay += dy * push;
        }
      }
      // Semi-implicit Euler: velocity first, then position from the new velocity.
      point.vx += ax * h;
      point.vy += ay * h;
      point.x += point.vx * h;
      point.y += point.vy * h;
    });
  }
}
