import { expect, test } from "bun:test";

import {
  LINE_COUNT,
  lineRest,
  REPEL_RADIUS,
  restingLines,
  stepLines,
  toLineSpace,
  type Line,
  type Pointer,
} from "./lines";

const away: Pointer = { across: 0, along: 0, active: false };

const run = (lines: Line[], pointer: Pointer, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepLines(lines, pointer, 1 / 60);
};

const at = (lines: Line[], i: number) => lineRest(i) + lines[i].shift;

test("the stack is centred", () => {
  expect(lineRest(0) + lineRest(LINE_COUNT - 1)).toBeCloseTo(0);
});

test("the shader's quarter turn: screen top is negative across, screen right is positive along", () => {
  expect(toLineSpace(0, 1, 1.5, 1).across).toBeCloseTo(-1);
  expect(toLineSpace(1, 0, 1.5, 1).along).toBeCloseTo(1.5);
});

test("lines stay put when nothing pushes them", () => {
  const lines = restingLines();
  run(lines, away, 2);
  for (const line of lines) expect(line.shift).toBeCloseTo(0, 6);
});

test("lines near the pointer are pushed away from it, on both sides", () => {
  const lines = restingLines();
  const pointer = { across: lineRest(8) - 0.02, along: 0, active: true };
  run(lines, pointer, 1);
  expect(lines[8].shift).toBeGreaterThan(0.05);
  expect(lines[7].shift).toBeLessThan(-0.05);
});

test("lines out of reach are left alone", () => {
  const lines = restingLines();
  const pointer = { across: lineRest(0), along: 0, active: true };
  run(lines, pointer, 1);
  const far = lines.findIndex((_, i) => Math.abs(lineRest(i) - pointer.across) > REPEL_RADIUS * 2);
  expect(lines[far].shift).toBeCloseTo(0, 6);
});

test("a line directly under the pointer still escapes", () => {
  const lines = restingLines();
  run(lines, { across: lineRest(4), along: 0, active: true }, 1);
  expect(Math.abs(lines[4].shift)).toBeGreaterThan(0.05);
});

test("pushed lines bunch up but never cross", () => {
  const lines = restingLines();
  for (let across = -1; across <= 1; across += 0.01) run(lines, { across, along: 0, active: true }, 0.05);
  for (let i = 1; i < LINE_COUNT; i++) expect(at(lines, i)).toBeGreaterThan(at(lines, i - 1));
});

test("lines spring back once the pointer leaves, even through long frames", () => {
  const lines = restingLines();
  run(lines, { across: lineRest(8), along: 0, active: true }, 1);
  for (let i = 0; i < 40; i++) stepLines(lines, away, 0.5);
  for (const line of lines) {
    expect(Number.isFinite(line.shift)).toBe(true);
    expect(line.shift).toBeCloseTo(0, 2);
  }
});
