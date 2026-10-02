import { expect, test } from "bun:test";

import {
  acrossLines,
  LINE_COUNT,
  LINE_SPACING,
  lineRest,
  REPEL_RADIUS,
  restingLines,
  stepLines,
  type Line,
  type Pointer,
} from "./waves";

const away: Pointer = { across: 0, active: false };

const run = (lines: Line[], pointer: Pointer, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepLines(lines, pointer, 1 / 60);
};

const at = (lines: Line[], i: number) => lineRest(i) + lines[i].shift;

test("the lines are centred and the quarter turn maps screen right to positive across", () => {
  expect(lineRest(0) + lineRest(LINE_COUNT - 1)).toBeCloseTo(0);
  expect(acrossLines(1, 1.5, 1)).toBeCloseTo(1.5);
});

test("lines stay put when nothing pushes them", () => {
  const lines = restingLines();
  run(lines, away, 2);
  for (const line of lines) expect(line.shift).toBeCloseTo(0, 6);
});

test("the strip under the pointer grows wider", () => {
  const lines = restingLines();
  // Midway between lines 7 and 8: the strip they bound.
  const pointer = { across: (lineRest(7) + lineRest(8)) / 2, active: true };
  run(lines, pointer, 1);
  expect(at(lines, 8) - at(lines, 7)).toBeGreaterThan(LINE_SPACING * 1.5);
});

test("lines out of reach are left alone", () => {
  const lines = restingLines();
  const pointer = { across: lineRest(0), active: true };
  run(lines, pointer, 1);
  const far = lines.findIndex((_, i) => Math.abs(lineRest(i) - pointer.across) > REPEL_RADIUS * 2);
  expect(lines[far].shift).toBeCloseTo(0, 6);
});

test("a line directly under the pointer still moves aside", () => {
  const lines = restingLines();
  run(lines, { across: lineRest(4), active: true }, 1);
  expect(Math.abs(lines[4].shift)).toBeGreaterThan(0.1);
});

test("lines spread but never cross", () => {
  const lines = restingLines();
  for (let across = -3; across <= 3; across += 0.03) run(lines, { across, active: true }, 0.05);
  for (let i = 1; i < LINE_COUNT; i++) expect(at(lines, i)).toBeGreaterThan(at(lines, i - 1));
});

test("lines spring back once the pointer leaves, even through long frames", () => {
  const lines = restingLines();
  run(lines, { across: lineRest(8), active: true }, 1);
  for (let i = 0; i < 40; i++) stepLines(lines, away, 0.5);
  for (const line of lines) {
    expect(Number.isFinite(line.shift)).toBe(true);
    expect(line.shift).toBeCloseTo(0, 2);
  }
});
