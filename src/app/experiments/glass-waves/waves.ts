// glassWaves.frag lays its lines out in a zoomed, quarter-turned space where
// they are spaced along y; on screen they stand vertical, side by side, and
// each gap between neighbours reads as one glass strip. Screen height is 2.

export const LINE_COUNT = 16;
export const LINE_SPACING = 0.4;

/** Mirrors glassWaves.frag: its slow breathing zoom, in shader time. */
const TIME_SCALE = 0.7;
export const zoomAt = (elapsed: number) => 1 + 0.05 * Math.sin(elapsed * TIME_SCALE * 0.35);

/** Spring back to rest at ~1Hz, a little under-damped so the strips wobble as they settle. */
const SPRING = 38;
const DAMPING = 7;
/**
 * The pointer pushes whole lines within this distance apart, hardest up close,
 * so the strips under it grow wider. Kept at or under SPRING × REPEL_RADIUS / 2
 * so a nearer line always settles further out than the one beyond it.
 */
export const REPEL_RADIUS = 0.8;
const REPEL_STRENGTH = 15;
/** Even mid-wobble, neighbours keep at least this gap, so lines never cross. */
const MIN_GAP = LINE_SPACING * 0.3;
/** Small fixed steps keep the springs stable however long a frame takes. */
const MAX_STEP = 1 / 120;
const MAX_FRAME = 1 / 30;

export type Line = { shift: number; velocity: number };
/** The pointer in line space: how far `across` the lines it is. */
export type Pointer = { across: number; active: boolean };

/** Where line `i` sits when nothing pushes it. */
export const lineRest = (i: number) => (i - (LINE_COUNT - 1) / 2) * LINE_SPACING;

export const restingLines = (): Line[] =>
  Array.from({ length: LINE_COUNT }, () => ({ shift: 0, velocity: 0 }));

/** NDC x → across the lines, following the shader's zoom and quarter turn. */
export const acrossLines = (x: number, aspect: number, zoom: number) => x * aspect * zoom;

/** Advances every line by `delta` seconds: spring to rest, pushed apart by an active pointer. */
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
          // Dead centre: split the lines, one half each way.
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
