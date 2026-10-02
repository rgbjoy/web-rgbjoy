// glassLines.frag lays its lines out in a zoomed, quarter-turned space where
// each line runs along y and the lines are spaced across x. On screen they run
// left to right, stacked top to bottom. Screen height is 2 in this space.

export const LINE_COUNT = 16;
export const LINE_SPACING = 0.1;

/** Mirrors glassLines.frag: its slow breathing zoom, in shader time. */
const TIME_SCALE = 0.7;
export const zoomAt = (elapsed: number) => 1 + 0.05 * Math.sin(elapsed * TIME_SCALE * 0.35);

/** Spring back to rest at ~1Hz, a little under-damped so the lines wobble as they settle. */
const SPRING = 38;
const DAMPING = 7;
/**
 * The pointer pushes lines within this distance across them, hardest up close.
 * Kept at or under SPRING × REPEL_RADIUS / 2 so a nearer line always settles
 * further out than the one beyond it — the stack bends, it doesn't fold.
 */
export const REPEL_RADIUS = 0.4;
const REPEL_STRENGTH = 7.5;
/** Even mid-wobble, neighbours keep at least this gap, so lines never cross. */
const MIN_GAP = LINE_SPACING * 0.3;
/** Small fixed steps keep the springs stable however long a frame takes. */
const MAX_STEP = 1 / 120;
const MAX_FRAME = 1 / 30;

export type Line = { shift: number; velocity: number };
/** The pointer in line space: `across` the lines and `along` them. */
export type Pointer = { across: number; along: number; active: boolean };

/** Where line `i` sits across the stack when nothing pushes it. */
export const lineRest = (i: number) => (i - (LINE_COUNT - 1) / 2) * LINE_SPACING;

export const restingLines = (): Line[] =>
  Array.from({ length: LINE_COUNT }, () => ({ shift: 0, velocity: 0 }));

/** NDC → line space, following the shader's zoom and quarter turn. */
export function toLineSpace(x: number, y: number, aspect: number, zoom: number) {
  return { across: -y * zoom, along: x * aspect * zoom };
}

/** Advances every line by `delta` seconds: spring to rest, pushed away from an active pointer. */
export function stepLines(lines: Line[], pointer: Pointer, delta: number) {
  let remaining = Math.min(Math.max(delta, 0), MAX_FRAME);
  while (remaining > 1e-6) {
    const h = Math.min(remaining, MAX_STEP);
    remaining -= h;
    lines.forEach((line, i) => {
      let force = -SPRING * line.shift - DAMPING * line.velocity;
      if (pointer.active) {
        const offset = lineRest(i) + line.shift - pointer.across;
        const distance = Math.abs(offset);
        if (distance < REPEL_RADIUS) {
          // Dead centre: split the stack, upper half one way and lower the other.
          const side = offset === 0 ? Math.sign(lineRest(i)) || 1 : Math.sign(offset);
          const falloff = 1 - distance / REPEL_RADIUS;
          force += side * REPEL_STRENGTH * falloff * falloff;
        }
      }
      // Semi-implicit Euler: velocity first, then position from the new velocity.
      line.velocity += force * h;
      line.shift += line.velocity * h;
    });
    for (let i = 1; i < lines.length; i++) {
      const floor = lineRest(i - 1) + lines[i - 1].shift + MIN_GAP;
      if (lineRest(i) + lines[i].shift < floor) {
        lines[i].shift = floor - lineRest(i);
        lines[i].velocity = Math.max(lines[i].velocity, lines[i - 1].velocity);
      }
    }
  }
}
