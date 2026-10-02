import { expect, test } from "bun:test";

import {
  gridHomes,
  POINT_COUNT,
  REPEL_RADIUS,
  restingPoints,
  stepPoints,
  type LensPoint,
  type Pointer,
} from "./points";

const away: Pointer = { x: 0, y: 0, active: false };

const run = (points: LensPoint[], homes: ReturnType<typeof gridHomes>, pointer: Pointer, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepPoints(points, homes, pointer, 1 / 60);
};

test("the grid is 5 × 3 and centred", () => {
  const homes = gridHomes(16 / 9);
  expect(homes.length).toBe(POINT_COUNT);
  const mean = homes.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y }), { x: 0, y: 0 });
  expect(mean.x / POINT_COUNT).toBeCloseTo(0);
  expect(mean.y / POINT_COUNT).toBeCloseTo(0);
});

test("points stay home when nothing pushes them", () => {
  const homes = gridHomes(1.5);
  const points = restingPoints(homes);
  run(points, homes, away, 2);
  points.forEach((point, i) => {
    expect(point.x).toBeCloseTo(homes[i].x, 6);
    expect(point.y).toBeCloseTo(homes[i].y, 6);
  });
});

test("a point near the pointer is pushed away from it", () => {
  const homes = gridHomes(1.5);
  const points = restingPoints(homes);
  const centre = homes[7];
  const pointer = { x: centre.x - 0.1, y: centre.y, active: true };
  const before = Math.hypot(points[7].x - pointer.x, points[7].y - pointer.y);
  run(points, homes, pointer, 1);
  const after = Math.hypot(points[7].x - pointer.x, points[7].y - pointer.y);
  expect(after).toBeGreaterThan(before + 0.05);
  expect(points[7].x).toBeGreaterThan(centre.x);
});

test("points out of reach are left alone", () => {
  const homes = gridHomes(1.5);
  const points = restingPoints(homes);
  const pointer = { x: homes[0].x, y: homes[0].y, active: true };
  run(points, homes, pointer, 1);
  const far = homes.findIndex((home) => Math.hypot(home.x - pointer.x, home.y - pointer.y) > REPEL_RADIUS * 1.5);
  expect(points[far].x).toBeCloseTo(homes[far].x, 6);
});

test("a point directly under the pointer still escapes", () => {
  const homes = gridHomes(1.5);
  const points = restingPoints(homes);
  run(points, homes, { x: homes[7].x, y: homes[7].y, active: true }, 1);
  expect(Math.hypot(points[7].x - homes[7].x, points[7].y - homes[7].y)).toBeGreaterThan(0.1);
});

test("points spring back home once the pointer leaves, even through long frames", () => {
  const homes = gridHomes(1.5);
  const points = restingPoints(homes);
  run(points, homes, { x: homes[7].x + 0.05, y: homes[7].y, active: true }, 1);
  for (let i = 0; i < 40; i++) stepPoints(points, homes, away, 0.5);
  points.forEach((point, i) => {
    expect(Number.isFinite(point.x)).toBe(true);
    expect(point.x).toBeCloseTo(homes[i].x, 2);
    expect(point.y).toBeCloseTo(homes[i].y, 2);
  });
});
