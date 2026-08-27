"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

type LeafletData = {
  key: string;
  position: [number, number, number];
  quaternion: Quaternion;
  scale: [number, number, number];
  phase: number;
  flap: number;
  color: string;
  /** Stem CatmullRom `t` at layout — drives wind `rotation.y` (green) scale along the rachis. */
  spawnT: number;
  /** Small fixed Euler offsets (rad) on the wind group — hashed from `key`, stable per instance. */
  rotNoise: [number, number, number];
};

// Flat arch in XY (z = 0): one plane, no 3D corkscrew. X pulls away hard over
// the back half so the rachis keeps bending as it runs out — an upside-down
// smile once the frond is pitched, rather than a near-straight comma.
// Endpoint Y is load-bearing: STEM_BASE_Y and PALM_STEM_BASE_LIFT_Y read it.
const STEM_POINTS = [
  new Vector3(0.0, -1.9, 0.0),
  new Vector3(0.2, -1.0, 0.0),
  new Vector3(0.8, -0.05, 0.0),
  new Vector3(1.84, 1.0, 0.0),
  new Vector3(3.2, 1.95, 0.0),
];

/** Max XY offset on inner stem control points (endpoints fixed) — subtle S-bend per frond. */
const STEM_CONTROL_NOISE_XY = 0.032;

function stemControlSignedNoise(seed: number, index: number, salt: number) {
  let h = (seed + index * 92837111 + salt * 19349669) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function stemControlPointsWithNoise(seed: number): Vector3[] {
  const pts = STEM_POINTS.map((p) => p.clone());
  for (let i = 1; i < pts.length - 1; i += 1) {
    const nx = stemControlSignedNoise(seed, i, 11);
    const ny = stemControlSignedNoise(seed, i, 73);
    pts[i].x += nx * STEM_CONTROL_NOISE_XY;
    pts[i].y += ny * STEM_CONTROL_NOISE_XY * 0.62;
  }
  return pts;
}

function stemVariationSeed(
  position: [number, number, number],
  windTimeOffset: number,
) {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= Math.floor(n * 1e6);
    h = Math.imul(h, 16777619);
  };
  mix(position[0]);
  mix(position[1]);
  mix(position[2]);
  mix(windTimeOffset * 1e4 + 1);
  return h >>> 0;
}

/**
 * Seconds added to the animation clock so each `PalmFrond` instance is out of phase (fan, sway, leaflet flutter).
 * Stable for a given `position` + `windTimeOffset`; SSR-safe.
 */
function palmFrondWindClockOffset(
  position: [number, number, number],
  windTimeOffset: number,
  scale: number,
) {
  let h = stemVariationSeed(position, windTimeOffset);
  h ^= Math.floor(scale * 1e6 + 1);
  h = Math.imul(h, 16777619);
  return ((h >>> 0) / 4294967296) * 73;
}

/**
 * Rest tilt on the inner leaflet group (same Euler axes as wind in useFrame), so motion swings from a biased pose.
 * Y matches the strongest flutter term (sin · flap · 0.72); amplitude scales with `spawnT`.
 */
const LEAFLET_WIND_BIAS_X = 0.035;
const LEAFLET_WIND_BIAS_Y = 0.11;
const LEAFLET_WIND_BIAS_Z = -0.04;

/** Whole frond: gentle fan back-and-forth around local +X (red axis) on `frondRef`. */
const PALM_FROND_FAN_X_FREQ = 0.15;
const PALM_FROND_FAN_X_AMP_RAD = 0.022;

/** Rachis rocks around stem base (`stemRockRef`); leaflets are parented so they follow. */
const STEM_BASE_Y = STEM_POINTS[0].y;
const PALM_STEM_ROCK_X_FREQ = 0.11;
const PALM_STEM_ROCK_X_AMP_RAD = 0.14;
const PALM_STEM_ROCK_Z_FREQ = 0.17;
const PALM_STEM_ROCK_Z_AMP_RAD = 0.05;

/** World Y of the laid-flat frond wrapper (scene places this group; e.g. white ground at −2.5). */
export const PALM_FROND_FLOAT_Y = 0.75;

/** Inner wind group Y (must match `frondRef` position below). */
export const PALM_FROND_INNER_GROUP_Y = -0.1;

/**
 * Move `PalmFrond` outer group by this +Y so stem base sits on parent origin, then rotate parent to fan fronds.
 * = −(STEM start Y + inner group Y)
 */
export const PALM_STEM_BASE_LIFT_Y = -(
  STEM_POINTS[0].y + PALM_FROND_INNER_GROUP_Y
);

/**
 * Leaflet rotation cheat sheet (geometry: vertex +X = along leaflet length / midrib from stem).
 *
 * Stem frame at each attachment (right-handed, shared via stemRachisFrame):
 *   tangent  — along the rachis (curve tangent, toward frond tip)
 *   side     — STEM_FRAME_UP × tangent, or STEM_FRAME_FALLBACK × tangent if parallel to up
 *   binormal — tangent × side (second radial axis; leaflet code passes this as `normal` to quat helper)
 *
 * Leaflets spawn on the CatmullRom centerline (stem tube still rendered); left/right pairs fan via direction.
 *
 * Live motion: `stemRockRef` rocks the rachis at the base; `frondRef` adds subtle whole-frond drift;
 * each leaflet inner group adds rotation.x / .y / .z in useFrame plus LEAFLET_WIND_BIAS_* on the rest pose.
 */
const PALM_DEBUG_LEAFLET_AXES = false;

/**
 * Roll about each leaflet's own midrib, so it sets which ribbon face points up.
 * Was π to suit the old scene Rx+Rz wrappers; those are gone now that the crown
 * stands on a +Y axis, and π left every leaflet underside-up.
 */
const LEAFLET_STRIP_ROLL_RAD = 0;
const LEAFLET_STRIP_ROLL_QUAT = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  LEAFLET_STRIP_ROLL_RAD,
);

const STEM_FRAME_UP = new Vector3(0, 1, 0);
const STEM_FRAME_FALLBACK = new Vector3(1, 0, 0);

/**
 * Right-handed orthonormal frame along the rachis (shared by leaflets).
 * tangent — unit, along curve toward increasing u
 * outSide — first radial axis
 * outBinormal — tangent × outSide
 */
function stemRachisFrame(
  tangent: Vector3,
  outSide: Vector3,
  outBinormal: Vector3,
) {
  outSide.crossVectors(STEM_FRAME_UP, tangent);
  if (outSide.lengthSq() < 1e-10) {
    outSide.crossVectors(STEM_FRAME_FALLBACK, tangent);
  }
  outSide.normalize();
  outBinormal.crossVectors(tangent, outSide).normalize();
}

const STEM_RADIUS_BASE = 0.07;
const STEM_RADIUS_TIP = 0.009;

function stemRadiusAlongCurve(u: number) {
  return MathUtils.lerp(
    STEM_RADIUS_BASE,
    STEM_RADIUS_TIP,
    Math.pow(MathUtils.clamp(u, 0, 1), 0.72),
  );
}

function createTaperedStemGeometry(
  curve: CatmullRomCurve3,
  tubularSegments: number,
  radialSegments: number,
) {
  const center = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();
  const binormal = new Vector3();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rowSize = radialSegments + 1;

  for (let i = 0; i <= tubularSegments; i += 1) {
    const u = i / tubularSegments;
    curve.getPointAt(u, center);
    curve.getTangentAt(u, tangent).normalize();

    stemRachisFrame(tangent, side, binormal);

    const radius = stemRadiusAlongCurve(u);

    for (let j = 0; j <= radialSegments; j += 1) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const nx = side.x * c + binormal.x * s;
      const ny = side.y * c + binormal.y * s;
      const nz = side.z * c + binormal.z * s;
      positions.push(
        center.x + nx * radius,
        center.y + ny * radius,
        center.z + nz * radius,
      );
      normals.push(nx, ny, nz);
      uvs.push(j / radialSegments, u);
    }
  }

  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * rowSize + j;
      const b = a + rowSize;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Midrib droop in mesh units (local −Y); scales with per-leaf `scale`; 0 at stem, strongest at tip. */
const LEAFLET_GEOMETRY_SAG = 0.062;

function createLeafletGeometry() {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 10;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const spineY = Math.sin(t * Math.PI * 0.82) * 0.08;
    const spineZ = Math.sin(t * Math.PI) * 0.06 * (1 - t * 0.32);
    const halfWidth =
      0.26 *
      Math.pow(1 - t, 0.36) *
      (0.76 + 0.24 * Math.sin((t + 0.06) * Math.PI));
    const twist = Math.sin(t * Math.PI) * 0.02;
    const sagY = -LEAFLET_GEOMETRY_SAG * Math.sin(t * Math.PI * 0.5) ** 2;

    positions.push(t, spineY + twist + sagY, spineZ - halfWidth);
    positions.push(t, spineY - twist + sagY, spineZ + halfWidth);

    uvs.push(0, t);
    uvs.push(1, t);
  }

  for (let i = 0; i < segments; i += 1) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  return geometry;
}

function leafletQuaternionFromDirection(
  direction: Vector3,
  tangent: Vector3,
  normal: Vector3,
) {
  const xAxis = direction.clone().normalize();
  const zAxis = new Vector3().crossVectors(xAxis, normal);
  if (zAxis.lengthSq() < 1e-8) {
    zAxis.crossVectors(xAxis, tangent);
  }
  if (zAxis.lengthSq() < 1e-8) {
    zAxis.crossVectors(xAxis, new Vector3(0, 1, 0));
  }
  zAxis.normalize();
  const yAxis = new Vector3().crossVectors(zAxis, xAxis).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(xAxis, yAxis, zAxis),
  );
}

/** Min curve `t` for the first main leaflet pair. */
export const PALM_LEAFLET_T_START = 0.14;
/** Manual center crown ribbon (`tip-c`); upper `spawnT` bound for tip wind easing. */
const PALM_TIP_LEAFLET_CURVE_T = 1;
/**
 * Curve-`t` span left bare between the last main pair (`PALM_LEAFLET_T_END`) and `tip-c`
 * (`PALM_TIP_LEAFLET_CURVE_T`). Smaller = less empty stem (ribbons still need a little clearance).
 */
/** Max curve `t` for the last generated main pair — leaves room before `tip-c`. */
export const PALM_LEAFLET_T_END = PALM_TIP_LEAFLET_CURVE_T;

/** Binormal splay toward rachis tip (rad); main crown scales the same amount 0→1 along `spawnT`. */
const PALM_LEAFLET_EXTRA_SPLAY_RAD = MathUtils.degToRad(20);

/** Midrib length from stem `reach` (sin-lobe): `lerp(min, max, reach)` before other scales. */
const LEAFLET_LENGTH_REACH_MIN = 0.58;
const LEAFLET_LENGTH_REACH_MAX = 1.45;
/** Applied after the reach lerp (uniform midrib scale). */
const LEAFLET_LENGTH_GLOBAL_MUL = 0.7;
/**
 * At max splay (`pairIndex / (pairCount-1)` → 1), length is multiplied by this (vs 1.0 at the base).
 * Lower = shorter “spanned” ribbons toward the rachis end. `1` = no extra shrink from splay.
 */
const PALM_LEAFLET_LENGTH_AT_FULL_SPLAY = 0.89;

/**
 * Floor on sin(π·t) before the reach power-law — otherwise sin→0 at the stem tip collapses midrib length.
 * Raise slightly if terminal leaflets still feel stubby; lower keeps tips closer to the old silhouette.
 */
const LEAFLET_REACH_SIN_FLOOR = 0.22;

function leafletReachFromStemT(t: number) {
  return Math.pow(
    Math.max(Math.sin(t * Math.PI), LEAFLET_REACH_SIN_FLOOR),
    0.72,
  );
}

/** Irregular spacing amplitude (fraction of avg gap); smoothed along the rachis before sort. */
const LEAFLET_PAIR_T_JITTER_MUL = 0.48;
/** Side stagger along stem (fraction of avg gap); blended with low-freq noise so it isn’t spike-y. */
const LEAFLET_SIDE_ALONG_STEM_JITTER_MUL = 0.46;
/** Midrib yaw jitter around tangent (rad); blended with same smooth backbone. */
const LEAFLET_PAIR_PLANE_YAW_JITTER_RAD = MathUtils.degToRad(6.5);
/** How much fine hash survives vs smoothed pair noise for side attach / yaw (lower = smoother). */
const LEAFLET_LAYOUT_FINE_NOISE_BLEND = 0.34;

/** Half-range on midrib length: each ribbon scales by a factor in `[1 − R, 1 + R]` from its layout key. */
const LEAFLET_LENGTH_JITTER_RANGE = 0.09;

/** Max magnitude (rad) per wind Euler axis from layout key (~0.04 ≈ ±2.3°). */
const LEAFLET_ROT_NOISE_RAD = 0.04;

function stableUnitFromString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** [1, 2, 1] / 4 along pair index — dampens jaggy per-pair spikes. */
function smoothNoiseAlongPairs01(values: number[]): number[] {
  const n = values.length;
  if (n <= 2) return values.slice();
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const a = values[Math.max(0, i - 1)];
    const b = values[i];
    const c = values[Math.min(n - 1, i + 1)];
    out[i] = (a + 2 * b + c) * 0.25;
  }
  return out;
}

/** Low-frequency [0, 1] noise along the crown for spacing / stagger / yaw (deterministic per layoutSeed). */
function layoutSmoothNoise01(layoutSeed: number, pairCount: number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < pairCount; i += 1) {
    raw.push(stableUnitFromString(`pairNoise:${layoutSeed}:${i}`));
  }
  let s = smoothNoiseAlongPairs01(raw);
  s = smoothNoiseAlongPairs01(s);
  return s;
}

function buildMonotonicPairStemT(
  layoutSeed: number,
  pairCount: number,
  smooth01: number[],
): number[] {
  const tSpan = PALM_LEAFLET_T_END - PALM_LEAFLET_T_START;
  if (pairCount <= 1) {
    return [
      MathUtils.clamp(
        PALM_LEAFLET_T_START + tSpan * 0.5,
        PALM_LEAFLET_T_START,
        PALM_LEAFLET_T_END,
      ),
    ];
  }
  const segment = tSpan / (pairCount - 1);
  const raw: number[] = [];
  for (let i = 0; i < pairCount; i += 1) {
    const frac = i / (pairCount - 1);
    const base = PALM_LEAFLET_T_START + frac * tSpan;
    const fine = stableUnitFromString(`pairT:${layoutSeed}:${i}`);
    const u = MathUtils.lerp(
      smooth01[i],
      fine,
      LEAFLET_LAYOUT_FINE_NOISE_BLEND,
    );
    const jitter = (u - 0.5) * 2 * LEAFLET_PAIR_T_JITTER_MUL * segment;
    raw.push(
      MathUtils.clamp(base + jitter, PALM_LEAFLET_T_START, PALM_LEAFLET_T_END),
    );
  }
  raw.sort((a, b) => a - b);
  return raw;
}

function leafletLengthJitterMul(key: string) {
  const u = stableUnitFromString(key);
  return MathUtils.lerp(
    1 - LEAFLET_LENGTH_JITTER_RANGE,
    1 + LEAFLET_LENGTH_JITTER_RANGE,
    u,
  );
}

function leafletRotNoiseEuler(key: string): [number, number, number] {
  return [
    MathUtils.lerp(
      -LEAFLET_ROT_NOISE_RAD,
      LEAFLET_ROT_NOISE_RAD,
      stableUnitFromString(`${key}:rx`),
    ),
    MathUtils.lerp(
      -LEAFLET_ROT_NOISE_RAD,
      LEAFLET_ROT_NOISE_RAD,
      stableUnitFromString(`${key}:ry`),
    ),
    MathUtils.lerp(
      -LEAFLET_ROT_NOISE_RAD,
      LEAFLET_ROT_NOISE_RAD,
      stableUnitFromString(`${key}:rz`),
    ),
  ];
}

const PALM_MAIN_LEAFLET_PAIRS = 42;

function createLeaflets(stemCurve: CatmullRomCurve3, layoutSeed: number) {
  const leaflets: LeafletData[] = [];
  const pairCount = PALM_MAIN_LEAFLET_PAIRS;
  const tangent = new Vector3();
  const side = new Vector3();
  const binormal = new Vector3();
  const sideDirection = new Vector3();
  const tempDirection = new Vector3();
  const point = new Vector3();
  const tempColor = new Color();
  const featherSpinQuat = new Quaternion();
  const tipSplayBlendQuat = new Quaternion();
  const planeYawQuat = new Quaternion();
  const tSpan = PALM_LEAFLET_T_END - PALM_LEAFLET_T_START;
  const segment = pairCount > 1 ? tSpan / (pairCount - 1) : 0;
  const smoothPair01 = layoutSmoothNoise01(layoutSeed, pairCount);
  const pairStemTs = buildMonotonicPairStemT(
    layoutSeed,
    pairCount,
    smoothPair01,
  );

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const pairT = pairStemTs[pairIndex];
    const tipSplayMatchBlend = pairCount > 1 ? pairIndex / (pairCount - 1) : 0;

    [-1, 1].forEach((sideSign) => {
      const fineAlong = stableUnitFromString(
        `pairSide:${layoutSeed}:${pairIndex}:${sideSign}`,
      );
      const uAlong = MathUtils.lerp(
        smoothPair01[pairIndex],
        fineAlong,
        LEAFLET_LAYOUT_FINE_NOISE_BLEND,
      );
      const alongShift =
        (uAlong - 0.5) *
        2 *
        LEAFLET_SIDE_ALONG_STEM_JITTER_MUL *
        segment *
        sideSign;
      const tLeaf = MathUtils.clamp(
        pairT + alongShift,
        PALM_LEAFLET_T_START,
        PALM_LEAFLET_T_END,
      );

      stemCurve.getPointAt(tLeaf, point);
      stemCurve.getTangentAt(tLeaf, tangent).normalize();
      stemRachisFrame(tangent, side, binormal);
      const reach = leafletReachFromStemT(tLeaf);
      const length =
        MathUtils.lerp(
          LEAFLET_LENGTH_REACH_MIN,
          LEAFLET_LENGTH_REACH_MAX,
          reach,
        ) *
        LEAFLET_LENGTH_GLOBAL_MUL *
        MathUtils.lerp(
          1,
          PALM_LEAFLET_LENGTH_AT_FULL_SPLAY,
          tipSplayMatchBlend,
        );
      const width = MathUtils.lerp(0.12, 0.22, reach);
      const featherSpinBlend = MathUtils.smoothstep(0.62, 0.98, tLeaf);
      const featherSpin = featherSpinBlend * 0.75;

      sideDirection.copy(side).multiplyScalar(sideSign);

      tempDirection
        .copy(sideDirection)
        .multiplyScalar(0.94)
        .addScaledVector(tangent, 0.16 + reach * 0.08)
        .normalize();

      featherSpinQuat.setFromAxisAngle(tangent, featherSpin * sideSign);
      tempDirection.applyQuaternion(featherSpinQuat).normalize();

      const fineYaw = stableUnitFromString(
        `pairYaw:${layoutSeed}:${pairIndex}:${sideSign}`,
      );
      const uYaw = MathUtils.lerp(
        smoothPair01[pairIndex],
        fineYaw,
        LEAFLET_LAYOUT_FINE_NOISE_BLEND,
      );
      const yawAmt = (uYaw - 0.5) * 2 * LEAFLET_PAIR_PLANE_YAW_JITTER_RAD;
      planeYawQuat.setFromAxisAngle(tangent, yawAmt);
      tempDirection.applyQuaternion(planeYawQuat).normalize();

      const quaternion = leafletQuaternionFromDirection(
        tempDirection,
        tangent,
        binormal,
      );
      quaternion.multiply(LEAFLET_STRIP_ROLL_QUAT);

      tipSplayBlendQuat.setFromAxisAngle(
        binormal,
        -PALM_LEAFLET_EXTRA_SPLAY_RAD * sideSign * tipSplayMatchBlend,
      );
      quaternion.premultiply(tipSplayBlendQuat);

      const key = `${pairIndex}-${sideSign}`;
      const lenMul = leafletLengthJitterMul(key);
      leaflets.push({
        key,
        position: [point.x, point.y, point.z],
        quaternion,
        scale: [length * lenMul, length * lenMul, width],
        phase: pairIndex * 0.42,
        flap: MathUtils.lerp(0.05, 0.13, reach),
        color: tempColor
          .setHSL(0.29, 0.42, MathUtils.lerp(0.25, 0.43, reach))
          .getStyle(),
        spawnT: tLeaf,
        rotNoise: leafletRotNoiseEuler(key),
      });
    });
  }

  return leaflets;
}

/** Frame + ribbon dims for the manual `tip-c` ribbon (origin sits on the curve). */
function sampleManualTipStem(
  curve: CatmullRomCurve3,
  t: number,
  point: Vector3,
  tangent: Vector3,
  side: Vector3,
  binormal: Vector3,
) {
  curve.getPointAt(t, point);
  curve.getTangentAt(t, tangent).normalize();
  stemRachisFrame(tangent, side, binormal);
  const reach = leafletReachFromStemT(t);
  const length =
    MathUtils.lerp(LEAFLET_LENGTH_REACH_MIN, LEAFLET_LENGTH_REACH_MAX, reach) *
    LEAFLET_LENGTH_GLOBAL_MUL *
    0.72;
  const width = MathUtils.lerp(0.12, 0.22, reach) * 0.85;
  return { reach, length, width };
}

const LEAFLET_WIND_Y_FLUTTER_MUL_BASE = 1;
const LEAFLET_WIND_Y_FLUTTER_MUL_TIP = 2.35;
const LEAFLET_WIND_Y_BIAS_MUL_BASE = 1;
const LEAFLET_WIND_Y_BIAS_MUL_TIP = 1.58;

const TIP_PHASE_BASE = (PALM_MAIN_LEAFLET_PAIRS - 0.5) * 0.42;

/** Single manual crown ribbon (`tip-c`) at the stem tip. */
function createTipLeaflets(stemCurve: CatmullRomCurve3): LeafletData[] {
  const tangent = new Vector3();
  const side = new Vector3();
  const binormal = new Vector3();
  const tempDirection = new Vector3();
  const tempColor = new Color();
  const point = new Vector3();

  const crown = sampleManualTipStem(
    stemCurve,
    PALM_TIP_LEAFLET_CURVE_T,
    point,
    tangent,
    side,
    binormal,
  );

  tempDirection.copy(tangent).normalize();
  const quaternionCenter = leafletQuaternionFromDirection(
    tempDirection,
    tangent,
    binormal,
  );
  quaternionCenter.multiply(LEAFLET_STRIP_ROLL_QUAT);

  const keyCenter = "tip-c";
  const lenMul = leafletLengthJitterMul(keyCenter);
  return [
    {
      key: keyCenter,
      position: [point.x, point.y, point.z],
      quaternion: quaternionCenter,
      scale: [
        crown.length * lenMul,
        crown.length * lenMul,
        crown.width * lenMul,
      ],
      phase: TIP_PHASE_BASE,
      flap: MathUtils.lerp(0.05, 0.13, crown.reach) * 0.96,
      color: tempColor
        .setHSL(0.29, 0.43, MathUtils.lerp(0.28, 0.46, crown.reach))
        .getStyle(),
      spawnT: PALM_TIP_LEAFLET_CURVE_T,
      rotNoise: leafletRotNoiseEuler(keyCenter),
    },
  ];
}

const LEAFLET_GEOMETRY = createLeafletGeometry();

export type PalmFrondProps = {
  /**
   * Extra seconds on the animation clock; each instance also gets an automatic offset from `position`
   * so multiple fronds stay out of phase without props.
   */
  windTimeOffset?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

function isTypingFocusTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const PalmFrond = memo(function PalmFrond({
  windTimeOffset = 0,
  position = [0, 0, 0],
  rotation,
  scale = 1,
}: PalmFrondProps) {
  const reactId = useId();
  const frondRef = useRef<Group>(null);
  const stemRockRef = useRef<Group>(null);
  const leafletRefs = useRef<Array<Group | null>>([]);
  const [leafletKeyDebug, setLeafletKeyDebug] = useState(false);

  const stemSeed = useMemo(
    () => stemVariationSeed(position, windTimeOffset),
    [position, windTimeOffset],
  );

  const windClockOffsetSec = useMemo(
    () => palmFrondWindClockOffset(position, windTimeOffset, scale),
    [position, windTimeOffset, scale],
  );

  const stemCurve = useMemo(
    () => new CatmullRomCurve3(stemControlPointsWithNoise(stemSeed)),
    [stemSeed],
  );

  const stemGeometry = useMemo(
    () => createTaperedStemGeometry(stemCurve, 96, 10),
    [stemCurve],
  );

  const leaflets = useMemo(
    () => [
      ...createLeaflets(stemCurve, stemSeed),
      ...createTipLeaflets(stemCurve),
    ],
    [stemCurve, stemSeed],
  );

  useEffect(() => {
    return () => {
      stemGeometry.dispose();
    };
  }, [stemGeometry]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingFocusTarget(e.target)) return;
      if (e.code === "KeyD" || e.key === "d" || e.key === "D") {
        setLeafletKeyDebug((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime + windTimeOffset + windClockOffsetSec;

    if (frondRef.current) {
      frondRef.current.rotation.x =
        Math.sin(time * PALM_FROND_FAN_X_FREQ) * PALM_FROND_FAN_X_AMP_RAD;
      frondRef.current.rotation.z = 0;
      frondRef.current.rotation.y = Math.sin(time * 0.26) * 0.048;
      frondRef.current.position.x = Math.sin(time * 0.21) * 0.09;
      frondRef.current.position.z = Math.sin(time * 0.17) * 0.04;
    }

    if (stemRockRef.current) {
      stemRockRef.current.rotation.x =
        Math.sin(time * PALM_STEM_ROCK_X_FREQ) * PALM_STEM_ROCK_X_AMP_RAD;
      stemRockRef.current.rotation.z =
        Math.sin(time * PALM_STEM_ROCK_Z_FREQ + 0.85) *
        PALM_STEM_ROCK_Z_AMP_RAD;
      stemRockRef.current.rotation.y = 0;
    }

    leaflets.forEach((leaflet, index) => {
      const group = leafletRefs.current[index];
      if (!group) return;

      const yAlongStem = MathUtils.smoothstep(
        PALM_LEAFLET_T_START,
        PALM_TIP_LEAFLET_CURVE_T,
        leaflet.spawnT,
      );
      const yFlutterMul = MathUtils.lerp(
        LEAFLET_WIND_Y_FLUTTER_MUL_BASE,
        LEAFLET_WIND_Y_FLUTTER_MUL_TIP,
        yAlongStem,
      );
      const yBiasMul = MathUtils.lerp(
        LEAFLET_WIND_Y_BIAS_MUL_BASE,
        LEAFLET_WIND_Y_BIAS_MUL_TIP,
        yAlongStem,
      );

      const [nX, nY, nZ] = leaflet.rotNoise;
      group.rotation.x =
        LEAFLET_WIND_BIAS_X +
        nX +
        Math.sin(time * 0.78 + leaflet.phase) * leaflet.flap * 0.14;
      group.rotation.y =
        LEAFLET_WIND_BIAS_Y * yBiasMul +
        nY +
        Math.sin(time * 1.18 + leaflet.phase) *
          leaflet.flap *
          0.72 *
          yFlutterMul;
      group.rotation.z =
        LEAFLET_WIND_BIAS_Z +
        nZ +
        Math.cos(time * 0.95 + leaflet.phase) * leaflet.flap * 0.22;
    });
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group ref={frondRef} position={[0, PALM_FROND_INNER_GROUP_Y, 0]}>
        <group position={[0, STEM_BASE_Y, 0]}>
          <group ref={stemRockRef}>
            <mesh
              geometry={stemGeometry}
              position={[0, -STEM_BASE_Y, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color="#6b8a43"
                roughness={0.8}
                metalness={0.05}
              />
            </mesh>

            {PALM_DEBUG_LEAFLET_AXES &&
              (() => {
                const mainOnly = leaflets.filter((l) => !l.key.startsWith("tip"));
                if (mainOnly.length === 0) return null;
                return [0, mainOnly.length - 1].map((debugIndex) => (
                  <group
                    key={`${reactId}-axes-${debugIndex}`}
                    position={[
                      mainOnly[debugIndex].position[0],
                      mainOnly[debugIndex].position[1] - STEM_BASE_Y,
                      mainOnly[debugIndex].position[2],
                    ]}
                    quaternion={mainOnly[debugIndex].quaternion}
                  >
                    <axesHelper args={[0.32]} />
                  </group>
                ));
              })()}

            {leaflets.map((leaflet, index) => (
              <group
                key={`${reactId}-${leaflet.key}`}
                position={[
                  leaflet.position[0],
                  leaflet.position[1] - STEM_BASE_Y,
                  leaflet.position[2],
                ]}
                quaternion={leaflet.quaternion}
              >
            {leafletKeyDebug && (
              <group
                position={[leaflet.scale[0] * 0.48, leaflet.scale[1] * 0.14, 0]}
              >
                <Html
                  center
                  distanceFactor={10}
                  occlude={false}
                  style={{ pointerEvents: "none" }}
                >
                  <div
                    style={{
                      padding: "1px 5px",
                      fontSize: "8px",
                      fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      color: "#111",
                      background: "rgba(255,255,255,0.92)",
                      borderRadius: "4px",
                      border: "1px solid rgba(0,0,0,0.12)",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    {leaflet.key}
                  </div>
                </Html>
              </group>
            )}
            <group
              ref={(node) => {
                leafletRefs.current[index] = node;
              }}
            >
              <mesh
                geometry={LEAFLET_GEOMETRY}
                scale={leaflet.scale}
                castShadow
              >
                <meshStandardMaterial
                  color={leaflet.color}
                  side={DoubleSide}
                  roughness={0.8}
                  metalness={0.02}
                />
              </mesh>
            </group>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
});
