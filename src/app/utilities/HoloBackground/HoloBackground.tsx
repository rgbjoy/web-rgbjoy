"use client"

import { useEffect, useRef, useState } from "react"

import styles from "./HoloBackground.module.css"

/**
 * The paper behind the index: a pastel wash, cool at the top and warm further
 * down, with a fine grain over it. It drifts on its own while the page sits
 * still, and travels up with the page — a little slower than the text, and
 * churning harder the faster you go — when it scrolls. The mouse tips it like
 * holographic foil: where the cursor sits turns the colours across the whole
 * screen, and the wash swirls and shifts hue beneath it.
 *
 * The colours run in a loop, so an index that never ends never runs out of
 * them. Raw WebGL2 for the same reason as the logo: three is not on this page.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2 u_resolution;
/** Idle drift, in noise units. Advances faster while the page is moving. */
uniform float u_drift;
/** How far the field has travelled with the page, in screen heights. */
uniform float u_scroll;
/** 0..1, how hard the page is being scrolled right now. */
uniform float u_stir;
uniform vec3 u_stops[5];
uniform float u_grain;
uniform float u_glow;
uniform float u_contrast;
uniform float u_saturation;
/** Cursor, in the same space as screen below. */
uniform vec2 u_pointer;
/** 0..1: eases in while the mouse is over the page, out when it leaves. */
uniform float u_presence;
/** The solid colour both ends fade into, and how much of the height each fade takes. */
uniform vec3 u_edge;
uniform float u_fade;
uniform float u_fadeTop;
/** 0..1 transition from the paper wash into the endless volumetric tunnel. */
uniform float u_sim;
/** Forward travel distance along the tunnel centerline. */
uniform float u_simZ;
/** Elapsed simulation seconds for organic mist flow and ping lifetimes. */
uniform float u_simTime;
/** 0..1 decaying fluid surge triggered by click pings. */
uniform float u_surge;
/** Pre-sampled spectrum anchors at (hue - 0.10, hue + 0.06, hue + 0.22). */
uniform vec3 u_specDeep[3];
uniform vec3 u_specMid[3];
uniform vec3 u_specBright[3];
/** Number of live pings compacted at the front of u_pings (0..8). */
uniform int u_activePings;
/** Live pings: x = wall hitAngle, y = wall hitZ, z = birthTime, w = angularWeight. */
uniform vec4 u_pings[8];

out vec4 outColor;

// 2D simplex noise — Ashima Arts / Ian McEwan, MIT licence.
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p);
    p = p * 2.02 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return value;
}

/** The five stops as a loop: each blends into the next, and the last back
 *  into the first. */
vec3 palette(float t) {
  float x = fract(t) * 5.0;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    // Distance to this stop around the loop, in stops.
    float d = abs(mod(x - float(i) + 2.5, 5.0) - 2.5);
    color += u_stops[i] * (1.0 - smoothstep(0.0, 1.0, d));
  }
  return color;
}

/** Fast, branchless blend across the 3 pre-sampled spectrum anchors. */
void evalSpectrum(float hueOffset, out vec3 deep, out vec3 mid, out vec3 bright) {
  float u = clamp((hueOffset + 0.10) * 6.25, 0.0, 2.0);
  float w0 = max(0.0, 1.0 - u);
  float w1 = 1.0 - abs(u - 1.0);
  float w2 = max(0.0, u - 1.0);
  deep = u_specDeep[0] * w0 + u_specDeep[1] * w1 + u_specDeep[2] * w2;
  mid = u_specMid[0] * w0 + u_specMid[1] * w1 + u_specMid[2] * w2;
  bright = u_specBright[0] * w0 + u_specBright[1] * w1 + u_specBright[2] * w2;
}

/** Gentle curved centerline so the distant opening drifts organically and
 *  inner bends catch soft crescent highlights. */
vec2 tunnelPath(float z) {
  return vec2(
    sin(z * 0.155) * 0.52 + sin(z * 0.068 + 1.35) * 0.28,
    cos(z * 0.125) * 0.44 + cos(z * 0.056 + 2.60) * 0.24
  );
}

float gyroid(vec3 p) {
  return dot(sin(p), cos(p.yzx));
}

/** Fast, smooth 3D volumetric mist with two rotated gyroid octaves. */
float tunnelMist(vec3 p) {
  float g1 = gyroid(p * 1.15 + vec3(0.0, 0.0, u_simTime * 0.22));
  vec3 p2 = p * 2.15 + vec3(g1 * 0.42, -g1 * 0.34, -u_simTime * 0.35);
  float g2 = gyroid(p2);
  return g1 * 0.65 + g2 * 0.35;
}

vec3 renderWash(float aspect, float grain) {
  vec2 screen = vec2(v_uv.x * aspect, 1.0 - v_uv.y);

  // Subtle inward pull as the wash opens into the tunnel.
  if (u_sim > 0.001) {
    vec2 midScreen = vec2(aspect * 0.5, 0.5);
    screen = mix(screen, midScreen + (screen - midScreen) * (1.0 - 0.16 * u_sim), u_sim);
  }

  // The cursor stirs the wash where it rests: a soft twist of the field around
  // it, strongest beneath the pointer and gone a third of a screen away, and
  // tighter while the page is moving.
  vec2 fromPointer = screen - u_pointer;
  float lens = exp(-dot(fromPointer, fromPointer) / 0.09) * u_presence;
  float twist = lens * (0.9 + 0.8 * u_stir);
  float tc = cos(twist);
  float ts = sin(twist);
  vec2 twisted = u_pointer + mat2(tc, ts, -ts, tc) * fromPointer;

  // y runs down the page and on with the scroll, so the field rides up with
  // the content instead of sitting still behind it.
  vec2 p = twisted + vec2(0.0, u_scroll);

  vec2 warp = vec2(
    fbm(p * 0.85 + vec2(u_drift, -0.6 * u_drift)),
    fbm(p * 0.85 + vec2(5.2 - 0.8 * u_drift, 1.3 + u_drift))
  );
  vec2 q = p + warp * (0.28 + 0.16 * u_stir);

  // Foil tipped toward the light: the cursor's place on screen turns the whole
  // sweep, and the patch beneath it runs further round the wheel.
  float tilt = ((u_pointer.x / aspect - 0.5) * 0.18 + (u_pointer.y - 0.5) * 0.12) * u_presence;
  float t = q.y * 0.5 + q.x * 0.08 + fbm(q * 1.3 - 0.5 * u_drift) * 0.1
    + tilt + lens * 0.22;
  vec3 color = palette(t);

  // Pushed past the stops themselves: more colour, and a wider spread between
  // the light and the deep parts, pivoting on the wash's own brightness so the
  // page does not get darker overall.
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color = (color - 0.86) * u_contrast + 0.86;

  // A little light caught under the cursor.
  color += lens * 0.035;

  // A wash of light from the upper right, like paper near a window.
  float glow = 1.0 - smoothstep(0.0, 1.3, distance(screen, vec2(aspect * 0.8, 0.15)));
  color += glow * u_glow;

  // Fine grain fixed to the screen, like the tooth of the paper.
  color += grain * u_grain;

  // Both ends fade to one flat colour, grain and all: the same colour the
  // page's own background is set to, so the wash runs on under Safari's
  // status bar and toolbar, past where it can be drawn, without a seam at
  // either end. The first and last rows are that colour exactly.
  float inset = 1.5 / u_resolution.y;
  float fadeBottom = 1.0 - smoothstep(inset, u_fade, v_uv.y);
  float fadeTop = smoothstep(1.0 - u_fadeTop, 1.0 - inset, v_uv.y);
  color = mix(clamp(color, 0.0, 1.0), u_edge, max(fadeBottom, fadeTop));

  return clamp(color, 0.0, 1.0);
}

vec3 renderTunnel(float aspect, float grain) {
  vec2 suv = (v_uv - 0.5) * vec2(aspect, 1.0);

  // Same cursor swirl as the background wash, kept strictly on the surface
  // colours and mist rather than bending the tunnel geometry or camera.
  vec2 ptrUV = vec2(u_pointer.x - 0.5 * aspect, 0.5 - u_pointer.y);
  vec2 fromPointer = suv - ptrUV;
  float lens = exp(-dot(fromPointer, fromPointer) / 0.09) * u_presence;
  float lensTwist = lens * (0.9 + 0.8 * u_stir);
  float ltc = cos(lensTwist);
  float lts = sin(lensTwist);
  vec2 swirledUV = ptrUV + mat2(ltc, -lts, lts, ltc) * fromPointer;
  vec2 swirlDelta = swirledUV - suv;
  float foilTilt = ((u_pointer.x / aspect - 0.5) * 0.045 + (u_pointer.y - 0.5) * 0.03) * u_presence;

  // Camera glides steadily along the curving tunnel centerline.
  vec3 ro = vec3(tunnelPath(u_simZ), u_simZ);
  vec3 look = vec3(tunnelPath(u_simZ + 3.6), u_simZ + 3.6);

  vec3 forward = normalize(look - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);

  float fov = 0.90 - u_surge * 0.04;
  vec3 rd = normalize(forward * fov + suv.x * right + suv.y * up);

  // Per-pixel dither eliminates slice banding in the volumetric fog.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_simTime * 0.01) * 43758.5453);

  vec3 accum = vec3(0.0);
  float transmittance = 1.0;

  const int STEPS = 22;
  for (int i = 0; i < STEPS; i++) {
    float s = (float(i) + dither) / float(STEPS);
    float dist = 0.35 + 15.2 * (0.28 * s + 0.72 * s * s);
    float stepLen = (15.2 / float(STEPS)) * (0.28 + 1.44 * s);

    vec3 p = ro + rd * dist;
    vec2 rel = p.xy - tunnelPath(p.z);
    float r = length(rel);
    float a = atan(rel.y, rel.x);

    // Single 3D surface wave expanding across the tunnel walls from each click's
    // exact wall hit point; skipped completely when no pings are active.
    float pingLight = 0.0;
    float pingExpand = 0.0;
    if (u_activePings > 0) {
      for (int k = 0; k < 8; k++) {
        if (k >= u_activePings) break;
        float age = u_simTime - u_pings[k].z;
        if (age < 0.0 || age > 4.4) continue;

        float hitAngle = u_pings[k].x;
        float hitZ = u_pings[k].y;
        float angWeight = u_pings[k].w;

        // Geodesic distance along the curved cylinder wall from the impact spot.
        float da = atan(sin(a - hitAngle), cos(a - hitAngle)) * 1.34 * angWeight;
        float dz = p.z - hitZ;
        float surfDist = length(vec2(da, dz));

        float waveRadius = age * 4.8;
        float band = 0.34 + age * 0.22;
        float dw = (surfDist - waveRadius) / band;
        float ring = exp(-(dw * dw));
        float impact = exp(-(surfDist * surfDist) / (0.16 + age * 0.42)) * exp(-age * 4.8);
        float env = smoothstep(0.0, 0.035, age) * exp(-age * 0.74);

        pingLight += (ring + impact * 0.55) * env;
        pingExpand += ring * env;
      }
    }

    // Tunnel shape stays calm and steady (only ripples on click pings).
    float baseR = 1.34 + 0.13 * sin(p.z * 0.35 + a * 2.0) + 0.07 * cos(p.z * 0.22 - a * 3.0) + pingExpand * 0.24;
    float wallEdge = r - baseR;
    float wallBody = smoothstep(-0.48, 0.78, wallEdge);
    float wallMask = smoothstep(-0.62, 0.22, wallEdge);
    float rim = exp(-(wallEdge * wallEdge) / 0.16);

    // Only evaluate the 3D surface mist when near or inside the tunnel wall.
    float mist = 0.0;
    float mistNorm = 0.5;
    if (wallMask > 0.005) {
      float twist = p.z * 0.075 + u_simTime * 0.035;
      float ct = cos(twist);
      float st = sin(twist);
      vec2 surfaceRel = rel + swirlDelta * 2.8;
      vec2 twistedRel = mat2(ct, -st, st, ct) * surfaceRel;
      mist = tunnelMist(vec3(twistedRel * 1.05, p.z * 0.30));
      mistNorm = clamp(mist * 0.5 + 0.5, 0.0, 1.0);
    }

    // Grazing-angle scatter creates the luminous crescent lip on curving inner bends.
    vec2 relDir = rel / max(r, 0.001);
    float radialDot = abs(dot(vec3(relDir, 0.0), rd));
    float grazingInv = 1.0 - clamp(radialDot, 0.0, 1.0);
    float grazing = grazingInv * grazingInv;

    float depthT = clamp(dist / 14.2, 0.0, 1.0);
    // Spread out in hue: mostly one rich region of the spectrum at a time,
    // with the surface colour bands swirling softly beneath the cursor.
    float hueOffset = (depthT - 0.30) * 0.095 + mist * 0.052
      + foilTilt + lens * (0.095 + 0.06 * u_stir) * wallMask
      + pingLight * wallMask * 0.045;
    vec3 deepCol, midCol, brightCol;
    evalSpectrum(hueOffset, deepCol, midCol, brightCol);

    // Outer near walls stay moody and abyssal; swirling mist ribbons & grazing bends glow.
    float ribbon = smoothstep(0.05, 0.62, depthT) * (0.38 + 0.62 * mistNorm) + mistNorm * 0.18;
    vec3 wallCol = mix(deepCol, midCol, clamp(ribbon, 0.0, 1.0));
    wallCol = mix(wallCol, brightCol, smoothstep(0.42, 0.96, depthT) * (0.58 + 0.28 * mistNorm));

    // Luminous inner crescent glow along the curving tunnel throat.
    float rimBoost = rim * (0.28 + 0.72 * grazing) * smoothstep(0.10, 0.75, depthT);
    vec3 sampleCol = wallCol + mix(brightCol, vec3(0.95, 0.98, 1.0), 0.42) * rimBoost * 0.78;

    // The ping wave illuminates the misty walls directly as it sweeps across them.
    vec3 pingCol = mix(brightCol, vec3(0.96, 0.99, 1.0), 0.58);
    sampleCol += pingCol * pingLight * wallMask * (0.65 + 0.85 * wallBody + 0.95 * rim);

    float density = (0.036 + wallBody * (0.40 + 0.16 * mistNorm) + rim * 0.14 + pingLight * wallMask * 0.10) * stepLen;
    float alpha = 1.0 - exp(-density);

    accum += transmittance * sampleCol * alpha;
    transmittance *= (1.0 - alpha);
    if (transmittance < 0.012) break;
  }

  // Radiant light at the far end of the endless tunnel.
  vec3 farDeep, farMid, farBright;
  evalSpectrum(0.08 + foilTilt, farDeep, farMid, farBright);
  vec3 coreGlow = mix(farBright, vec3(0.95, 0.98, 1.0), 0.66);
  accum += transmittance * coreGlow * (1.12 + u_surge * 0.14);

  // A little light caught under the cursor, matching the wash.
  accum += farBright * lens * 0.04;

  // Soft vignette reinforces depth at the edges without crushing the shadows.
  float vig = smoothstep(1.25, 0.18, length(suv));
  accum *= mix(0.74, 1.04, vig);

  // Gentle filmic shoulder so bright core and overlapping pings bloom smoothly.
  vec3 color = accum / (1.0 + accum * 0.24);
  color = pow(clamp(color, 0.0001, 1.0), vec3(0.96));

  // Fine atmospheric film grain.
  color += grain * 0.044;

  return clamp(color, 0.0, 1.0);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;

  if (u_sim <= 0.001) {
    outColor = vec4(renderWash(aspect, grain), 1.0);
    return;
  }

  if (u_sim >= 0.999) {
    outColor = vec4(renderTunnel(aspect, grain), 1.0);
    return;
  }

  float blend = smoothstep(0.0, 1.0, u_sim);
  vec3 wash = renderWash(aspect, grain);
  vec3 tunnel = renderTunnel(aspect, grain);
  outColor = vec4(mix(wash, tunnel, blend), 1.0);
}`

/** Top to bottom, then round again, after the Stripe Press wash: cool blue,
 *  warm white, apricot, rose, lilac. Mirrored in the module CSS as the fallback
 *  before WebGL is up. */
const STOPS = ["#c6d6e3", "#f2eee4", "#f7d9a8", "#f5bfbd", "#d4c6ec"]
const GRAIN = 0.04
const GLOW = 0.035
/** Spread around the wash's mid-brightness, and colour beyond the stops'. */
const CONTRAST = 1.18
const SATURATION = 1.22

/** Screen heights the field travels per screen of page scrolled: it moves with
 *  the page, a little behind it. */
const PARALLAX = 0.35
/** Drift speeds in noise units per second, blended by scroll and pointer activity. */
const IDLE_DRIFT_RATE = 0.07
const FULL_STIR_DRIFT_RATE = 0.28
/** Scroll speed, px per second, that counts as stirring it as hard as it goes. */
const STIR_FULL = 2400
/** How quickly the stir follows the scroll speed, per second. */
const STIR_EASE = 5
/** Mouse speed, in screen heights per second, that stirs it as hard as it goes.
 *  Higher than it sounds: the mouse should tease it, scrolling should churn it. */
const MOUSE_STIR_FULL = 6
/** How quickly the wash follows the cursor, and fades its effect in and out,
 *  per second. Slow enough to feel like liquid catching up. */
const POINTER_EASE = 4
const PRESENCE_EASE = 2.5
/** Shares of the height over which the bottom and the top fade to one solid
 *  colour. */
const FADE = 0.22
const FADE_TOP = 0.14
/** How often that colour is read back from the wash where the fades begin,
 *  and how quickly it drifts toward what it reads, per second. Slow, so the
 *  flat ends follow the gradient without flickering. */
const EDGE_INTERVAL_MS = 500
const EDGE_EASE = 1.5
/** Least time between changes to the page's background: each one repaints
 *  the page's root. */
const EDGE_APPLY_MS = 100
/** Cap idle wash repaints to ~30fps even on 120Hz displays. */
const IDLE_FRAME_MS = 33

/** Simulation timing & kinematics. */
const SIM_ENTER_S = 1.35
const SIM_EXIT_S = 1.05
const SIM_SPEED = 1.65
const SIM_SURGE_SPEED = 1.35
const SIM_SURGE_DECAY = 2.1
/** Full pass through the 7-stop spectrum (~56s, so each colour family lingers ~8s). */
const SIM_HUE_RATE = 1 / 56
const PING_COUNT = 8
const PING_MAX_AGE = 4.4

/** Seven atmospheric spectrum stops (single source of truth for both shader
 *  anchors and the root viewport background): deep wall shadow, velvety mid
 *  body, and luminous core glow. */
type Rgb = readonly [number, number, number]
const SIM_SPECTRUM_STOPS: readonly { deep: Rgb; mid: Rgb; bright: Rgb }[] = [
  { deep: [0.024, 0.07, 0.165], mid: [0.055, 0.44, 0.62], bright: [0.48, 0.91, 0.96] },
  { deep: [0.018, 0.105, 0.135], mid: [0.045, 0.54, 0.51], bright: [0.48, 0.95, 0.85] },
  { deep: [0.03, 0.115, 0.075], mid: [0.15, 0.56, 0.34], bright: [0.66, 0.96, 0.68] },
  { deep: [0.145, 0.078, 0.025], mid: [0.76, 0.47, 0.13], bright: [1.0, 0.88, 0.56] },
  { deep: [0.175, 0.034, 0.068], mid: [0.78, 0.23, 0.35], bright: [1.0, 0.71, 0.76] },
  { deep: [0.11, 0.028, 0.175], mid: [0.52, 0.2, 0.72], bright: [0.88, 0.68, 1.0] },
  { deep: [0.035, 0.045, 0.185], mid: [0.16, 0.29, 0.76], bright: [0.6, 0.8, 1.0] },
]
const SPEC_ANCHOR_OFFSETS = [-0.1, 0.06, 0.22] as const

function sampleSpectrumStop(
  hue: number,
  deepOut: Float32Array,
  midOut: Float32Array,
  brightOut: Float32Array,
  offset: number,
) {
  const wrapped = ((hue % 1) + 1) % 1
  const x = wrapped * SIM_SPECTRUM_STOPS.length
  const i0 = Math.floor(x) % SIM_SPECTRUM_STOPS.length
  const i1 = (i0 + 1) % SIM_SPECTRUM_STOPS.length
  const t = x - Math.floor(x)
  const f = t * t * (3 - 2 * t)
  const a = SIM_SPECTRUM_STOPS[i0]
  const b = SIM_SPECTRUM_STOPS[i1]
  for (let c = 0; c < 3; c++) {
    deepOut[offset + c] = a.deep[c] + (b.deep[c] - a.deep[c]) * f
    midOut[offset + c] = a.mid[c] + (b.mid[c] - a.mid[c]) * f
    brightOut[offset + c] = a.bright[c] + (b.bright[c] - a.bright[c]) * f
  }
}

function sampleDeepColor(hue: number, out: number[]) {
  const wrapped = ((hue % 1) + 1) % 1
  const x = wrapped * SIM_SPECTRUM_STOPS.length
  const i0 = Math.floor(x) % SIM_SPECTRUM_STOPS.length
  const i1 = (i0 + 1) % SIM_SPECTRUM_STOPS.length
  const t = x - Math.floor(x)
  const f = t * t * (3 - 2 * t)
  const a = SIM_SPECTRUM_STOPS[i0].deep
  const b = SIM_SPECTRUM_STOPS[i1].deep
  // Match the shader's outer vignette (~0.76) so the viewport chrome blends in.
  out[0] = (a[0] + (b[0] - a[0]) * f) * 0.76
  out[1] = (a[1] + (b[1] - a[1]) * f) * 0.76
  out[2] = (a[2] + (b[2] - a[2]) * f) * 0.76
}

/** Mirrors `tunnelPath(z)` in the fragment shader so clicks intersect the exact
 *  3D tunnel wall under the cursor. */
function tunnelPathX(z: number): number {
  return Math.sin(z * 0.155) * 0.52 + Math.sin(z * 0.068 + 1.35) * 0.28
}

function tunnelPathY(z: number): number {
  return Math.cos(z * 0.125) * 0.44 + Math.cos(z * 0.056 + 2.6) * 0.24
}

/** Casts the click ray against the curved tunnel cylinder to find the exact
 *  3D wall coordinates `(hitAngle, hitZ)` and angular focus (`0..1`). */
function raycastTunnelWall(
  suvX: number,
  suvY: number,
  simZ: number,
  surge: number,
): [number, number, number] {
  const roX = tunnelPathX(simZ)
  const roY = tunnelPathY(simZ)
  const roZ = simZ

  const lookZ = simZ + 3.6
  const lookX = tunnelPathX(lookZ)
  const lookY = tunnelPathY(lookZ)

  let fx = lookX - roX
  let fy = lookY - roY
  let fz = lookZ - roZ
  const fLen = Math.hypot(fx, fy, fz) || 1
  fx /= fLen
  fy /= fLen
  fz /= fLen

  // right = normalize(cross((0, 1, 0), forward)) = normalize((fz, 0, -fx))
  let rx = fz
  let rz = -fx
  const rLen = Math.hypot(rx, rz) || 1
  rx /= rLen
  rz /= rLen

  // up = cross(forward, right)
  const ux = fy * rz
  const uy = fz * rx - fx * rz
  const uz = -fy * rx

  const fov = 0.9 - surge * 0.04
  let rdx = fx * fov + suvX * rx + suvY * ux
  let rdy = fy * fov + suvY * uy
  let rdz = fz * fov + suvX * rz + suvY * uz
  const rdLen = Math.hypot(rdx, rdy, rdz) || 1
  rdx /= rdLen
  rdy /= rdLen
  rdz /= rdLen

  const WALL_R = 1.32
  const MIN_DIST = 0.35
  const MAX_DIST = 14.5
  const STEPS = 96

  let prevDist = MIN_DIST
  let prevR = 0
  let bestR = 0
  let bestAngle = Math.atan2(suvY, suvX)
  let bestZ = simZ + 11.0

  for (let i = 0; i <= STEPS; i++) {
    const dist = MIN_DIST + ((MAX_DIST - MIN_DIST) * i) / STEPS
    const px = roX + rdx * dist
    const py = roY + rdy * dist
    const pz = roZ + rdz * dist
    const relX = px - tunnelPathX(pz)
    const relY = py - tunnelPathY(pz)
    const r = Math.hypot(relX, relY)

    if (r >= WALL_R) {
      // Linearly refine the crossing point so the ping lands flush on the wall.
      const frac = i > 0 && r > prevR ? (WALL_R - prevR) / (r - prevR) : 0
      const hitDist = prevDist + (dist - prevDist) * Math.max(0, Math.min(1, frac))
      const hx = roX + rdx * hitDist
      const hy = roY + rdy * hitDist
      const hz = roZ + rdz * hitDist
      const hRelX = hx - tunnelPathX(hz)
      const hRelY = hy - tunnelPathY(hz)
      return [Math.atan2(hRelY, hRelX), hz, 1]
    }

    if (r > bestR) {
      bestR = r
      bestAngle = Math.atan2(relY, relX)
      bestZ = pz
    }
    prevDist = dist
    prevR = r
  }

  // Click pointed straight into the open core: smoothly widen into a full throat ring.
  const t = Math.max(0, Math.min(1, (bestR - 0.25) / (WALL_R - 0.25)))
  const angWeight = t * t * (3 - 2 * t)
  return [bestAngle, bestZ, angWeight]
}

function stopsToFloats(): Float32Array {
  return new Float32Array(
    STOPS.flatMap((hex) => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ]),
  )
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.error(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return null
}

export function HoloBackground({
  scroll,
  still = false,
  simulation = false,
}: {
  /** Page scroll in px, read once a frame. Must not jump when the page jumps
   *  for layout reasons — the endless index wraps — or the wash jumps too. */
  scroll: () => number
  /** Reduced motion: one still frame, redrawn only on resize. */
  still?: boolean
  /** Transforms the wash into the interactive endless spectrum tunnel. */
  simulation?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(scroll)
  const stillRef = useRef(still)
  const simulationRef = useRef(simulation)
  const kickLoopRef = useRef<(() => void) | null>(null)
  // Bumped when a lost WebGL context comes back, to build everything again on it.
  const [contextGeneration, setContextGeneration] = useState(0)

  useEffect(() => {
    scrollRef.current = scroll
  }, [scroll])

  useEffect(() => {
    stillRef.current = still
    simulationRef.current = simulation
    kickLoopRef.current?.()
  }, [still, simulation])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    })
    // No WebGL: the CSS gradient under the canvas is the background.
    if (!gl || gl.isContextLost()) return

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      return
    }

    const program = gl.createProgram()
    if (!program) {
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      return
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }
    gl.useProgram(program)

    // One triangle over the clip volume: no diagonal seam, fewer vertices.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, "u_resolution")
    const uDrift = gl.getUniformLocation(program, "u_drift")
    const uScroll = gl.getUniformLocation(program, "u_scroll")
    const uStir = gl.getUniformLocation(program, "u_stir")
    gl.uniform3fv(gl.getUniformLocation(program, "u_stops"), stopsToFloats())
    gl.uniform1f(gl.getUniformLocation(program, "u_grain"), GRAIN)
    gl.uniform1f(gl.getUniformLocation(program, "u_glow"), GLOW)
    gl.uniform1f(gl.getUniformLocation(program, "u_contrast"), CONTRAST)
    gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), SATURATION)
    const uPointer = gl.getUniformLocation(program, "u_pointer")
    const uPresence = gl.getUniformLocation(program, "u_presence")
    const uEdge = gl.getUniformLocation(program, "u_edge")
    gl.uniform1f(gl.getUniformLocation(program, "u_fade"), FADE)
    gl.uniform1f(gl.getUniformLocation(program, "u_fadeTop"), FADE_TOP)

    const uSim = gl.getUniformLocation(program, "u_sim")
    const uSimZ = gl.getUniformLocation(program, "u_simZ")
    const uSimTime = gl.getUniformLocation(program, "u_simTime")
    const uSurge = gl.getUniformLocation(program, "u_surge")
    const uSpecDeep = gl.getUniformLocation(program, "u_specDeep")
    const uSpecMid = gl.getUniformLocation(program, "u_specMid")
    const uSpecBright = gl.getUniformLocation(program, "u_specBright")
    const uActivePings = gl.getUniformLocation(program, "u_activePings")
    const uPings = gl.getUniformLocation(program, "u_pings")

    // Cached bounding rect updated on resize so pointermove never forces layout.
    const canvasBox = { left: 0, top: 0, width: 1, height: 1 }
    const measureBox = () => {
      const rect = canvas.getBoundingClientRect()
      canvasBox.left = rect.left
      canvasBox.top = rect.top
      canvasBox.width = Math.max(1, rect.width)
      canvasBox.height = Math.max(1, rect.height)
    }

    // A soft gradient gains nothing from device pixels, and the grain reads as
    // paper at one dot per CSS pixel. Keeps the per-pixel noise cheap.
    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth))
      const height = Math.max(1, Math.round(canvas.clientHeight))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
        measureBox()
      }
    }
    measureBox()

    // A random start, so every visit opens on a slightly different wash.
    let drift = Math.random() * 1.4
    let stir = 0
    let scrollY = scrollRef.current()

    // Simulation state: starts in the abyssal blue/cyan band and drifts slowly
    // around the spectrum while active.
    let simMix = simulationRef.current ? 1 : 0
    let simZ = 0
    let simTime = 0
    let simHue = 0
    let surge = 0
    const specDeep = new Float32Array(9)
    const specMid = new Float32Array(9)
    const specBright = new Float32Array(9)
    const pingsData = new Float32Array(PING_COUNT * 4)
    let activePingCount = 0
    let pingsDirty = true
    const simDeepNow = [0, 0, 0]

    // The cursor in shader space: x and y both in screen heights, y down.
    // `target` is where it is; `pointer` eases after it.
    const target = { x: 0, y: 0, presence: 0 }
    const pointer = { x: 0, y: 0, presence: 0 }
    let pointerSeen = false
    let pointerTravel = 0

    /*
     * Safari on iOS draws the page past the viewport, under its status bar and
     * floating toolbar, where no fixed element reaches and only the page's own
     * background shows. So both ends of the wash fade to one solid colour, and
     * the page's background is set to exactly that colour: the wash meets it
     * without a seam at either end. The colour is the mean of the two rows
     * where the fades begin, eased toward each new reading.
     *
     * Reading pixels back makes the CPU wait for the GPU to finish drawing, a
     * stall every time. So after the first frame the read is queued into a
     * buffer behind a fence, and collected on a later frame once the fence
     * has passed — never waited on.
     */
    const root = document.documentElement
    const edgeTarget = [0, 0, 0]
    const edgeNow = [0, 0, 0]
    let edgeReady = false
    let edgeReadAt = -Infinity
    let edgeAppliedAt = -Infinity
    let appliedR = -1
    let appliedG = -1
    let appliedB = -1
    let rows = new Uint8Array(0)
    const packBuffer = gl.createBuffer()
    let packBufferWidth = 0
    let pending: WebGLSync | null = null
    let pendingWidth = 0
    let lost = false

    /** The rows where the bottom and top fades begin, counted from the bottom
     *  as GL counts them: the wash itself, untouched by either fade. */
    const edgeRows = () => {
      const height = canvas.height
      return [
        Math.min(height - 1, Math.floor(height * FADE)),
        Math.max(0, height - 1 - Math.floor(height * FADE_TOP)),
      ]
    }

    const ensureRows = (width: number) => {
      if (rows.length < width * 8) rows = new Uint8Array(width * 8)
    }

    /** Averages two read rows into the target. A read from a dead context
     *  comes back as zeros, alpha included, and is ignored rather than easing
     *  the page toward black. */
    const averageRows = (width: number) => {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const count = width * 2
      for (let i = 0; i < count; i++) {
        r += rows[i * 4]
        g += rows[i * 4 + 1]
        b += rows[i * 4 + 2]
        a += rows[i * 4 + 3]
      }
      if (a / count < 128) return false
      edgeTarget[0] = r / count / 255
      edgeTarget[1] = g / count / 255
      edgeTarget[2] = b / count / 255
      return true
    }

    /** Reads straight back, waiting on the GPU. Only where a frame cannot show
     *  without the colour: the first, and a still one. */
    const readNow = () => {
      if (gl.isContextLost()) return false
      const width = canvas.width
      const [bottom, top] = edgeRows()
      ensureRows(width)
      gl.readPixels(0, bottom, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, rows, 0)
      gl.readPixels(0, top, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, rows, width * 4)
      return averageRows(width)
    }

    /** Queues the same read into a buffer the GPU fills in its own time. */
    const requestRead = () => {
      if (pending || gl.isContextLost()) return
      const width = canvas.width
      const [bottom, top] = edgeRows()
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer)
      if (packBufferWidth !== width) {
        gl.bufferData(gl.PIXEL_PACK_BUFFER, width * 8, gl.STREAM_READ)
        packBufferWidth = width
      }
      gl.readPixels(0, bottom, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0)
      gl.readPixels(0, top, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, width * 4)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
      pendingWidth = width
      gl.flush()
    }

    /** Collects a queued read if the GPU has finished it. Never blocks: a zero
     *  timeout only asks. */
    const collectRead = () => {
      if (!pending || gl.isContextLost()) return
      const status = gl.clientWaitSync(pending, 0, 0)
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) return
      gl.deleteSync(pending)
      pending = null
      ensureRows(pendingWidth)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer)
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rows, 0, pendingWidth * 8)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      averageRows(pendingWidth)
    }

    /** The shader's solid colour and the page's background, set together to
     *  the same rounded value so they are never a shade apart. */
    const applyEdge = (force = false) => {
      if (gl.isContextLost()) return
      const now = performance.now()
      if (!force && now - edgeAppliedAt < EDGE_APPLY_MS) return

      // Wash edge stays on the shader's u_edge; the root background follows
      // the tunnel's deep shadow tone smoothly while in simulation.
      const washR = Math.round(edgeNow[0] * 255)
      const washG = Math.round(edgeNow[1] * 255)
      const washB = Math.round(edgeNow[2] * 255)
      gl.uniform3f(uEdge, washR / 255, washG / 255, washB / 255)

      let r = washR
      let g = washG
      let b = washB
      if (simMix > 0.001) {
        sampleDeepColor(simHue - 0.03, simDeepNow)
        const s = simMix * simMix * (3 - 2 * simMix)
        r = Math.round((edgeNow[0] + (simDeepNow[0] - edgeNow[0]) * s) * 255)
        g = Math.round((edgeNow[1] + (simDeepNow[1] - edgeNow[1]) * s) * 255)
        b = Math.round((edgeNow[2] + (simDeepNow[2] - edgeNow[2]) * s) * 255)
      }

      if (r === appliedR && g === appliedG && b === appliedB) return
      edgeAppliedAt = now
      appliedR = r
      appliedG = g
      appliedB = b
      root.style.backgroundColor = `rgb(${r} ${g} ${b})`
    }

    const draw = () => {
      if (gl.isContextLost()) return
      resize()
      gl.uniform2f(uResolution, canvas.width, canvas.height)
      gl.uniform1f(uDrift, drift)
      gl.uniform1f(uScroll, (scrollY / Math.max(1, canvas.clientHeight)) * PARALLAX)
      gl.uniform1f(uStir, stir)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.uniform1f(uPresence, pointer.presence)
      gl.uniform1f(uSim, simMix)
      if (simMix > 0.001) {
        gl.uniform1f(uSimZ, simZ)
        gl.uniform1f(uSimTime, simTime)
        gl.uniform1f(uSurge, surge)
        for (let i = 0; i < 3; i++) {
          sampleSpectrumStop(simHue + SPEC_ANCHOR_OFFSETS[i], specDeep, specMid, specBright, i * 3)
        }
        gl.uniform3fv(uSpecDeep, specDeep)
        gl.uniform3fv(uSpecMid, specMid)
        gl.uniform3fv(uSpecBright, specBright)
        gl.uniform1i(uActivePings, activePingCount)
        if (pingsDirty) {
          if (activePingCount > 0) gl.uniform4fv(uPings, pingsData)
          pingsDirty = false
        }
      }
      if (edgeReady) applyEdge()
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      const needSyncEdge = !edgeReady || (stillRef.current && simMix <= 0.001)
      if (needSyncEdge && simMix <= 0.001) {
        // Take the colour as read and draw again with it, rather than showing
        // a frame that fades into nothing.
        if (readNow()) {
          edgeReady = true
          edgeNow[0] = edgeTarget[0]
          edgeNow[1] = edgeTarget[1]
          edgeNow[2] = edgeTarget[2]
          applyEdge(true)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
        }
      } else if (simMix <= 0.001) {
        const now = performance.now()
        if (now - edgeReadAt >= EDGE_INTERVAL_MS) {
          edgeReadAt = now
          requestRead()
        }
      }
      canvas.dataset.ready = "true"
    }

    let frame = 0
    let last = performance.now()
    let lastDrawAt = -Infinity

    const loop = (now: number) => {
      frame = 0
      if (document.hidden) return
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now

      const inSim = simulationRef.current
      if (inSim && simMix < 1) {
        simMix = Math.min(1, simMix + dt / SIM_ENTER_S)
      } else if (!inSim && simMix > 0) {
        simMix = Math.max(0, simMix - dt / SIM_EXIT_S)
      }

      const simActive = simMix > 0.001 || inSim

      if (simActive) {
        simTime += dt
        surge *= Math.exp(-SIM_SURGE_DECAY * dt)
        if (surge < 0.0005) surge = 0
        // Tunnel glides steadily forward; pings add a gentle momentary pulse.
        const motionScale = 0.35 + 0.65 * simMix
        simZ += dt * (SIM_SPEED + surge * SIM_SURGE_SPEED) * motionScale
        simHue = (simHue + dt * SIM_HUE_RATE * motionScale) % 1

        // Expire finished pings in place so the shader skips the ping loop when idle.
        if (activePingCount > 0) {
          let write = 0
          for (let read = 0; read < activePingCount; read++) {
            const ro = read * 4
            const age = simTime - pingsData[ro + 2]
            if (age >= 0 && age <= PING_MAX_AGE) {
              if (write !== read) {
                const wo = write * 4
                pingsData[wo] = pingsData[ro]
                pingsData[wo + 1] = pingsData[ro + 1]
                pingsData[wo + 2] = pingsData[ro + 2]
                pingsData[wo + 3] = pingsData[ro + 3]
              }
              write++
            }
          }
          if (write !== activePingCount) {
            activePingCount = write
            pingsDirty = true
          }
        }
      }

      const nextScroll = scrollRef.current()
      const moved = nextScroll !== scrollY
      const speed = dt > 0 ? Math.abs(nextScroll - scrollY) / dt : 0
      scrollY = nextScroll

      const mouseSpeed = dt > 0 ? pointerTravel / dt : 0
      pointerTravel = 0
      const stirTarget = Math.min(1, Math.max(speed / STIR_FULL, mouseSpeed / MOUSE_STIR_FULL))
      stir += (stirTarget - stir) * (1 - Math.exp(-STIR_EASE * dt))
      if (!stillRef.current) {
        drift += dt * (IDLE_DRIFT_RATE + stir * (FULL_STIR_DRIFT_RATE - IDLE_DRIFT_RATE))
      }

      const follow = 1 - Math.exp(-POINTER_EASE * dt)
      pointer.x += (target.x - pointer.x) * follow
      pointer.y += (target.y - pointer.y) * follow
      pointer.presence += (target.presence - pointer.presence) * (1 - Math.exp(-PRESENCE_EASE * dt))
      const settling =
        Math.abs(target.x - pointer.x) + Math.abs(target.y - pointer.y) > 0.001 ||
        Math.abs(target.presence - pointer.presence) > 0.002

      collectRead()
      const toward = 1 - Math.exp(-EDGE_EASE * dt)
      for (let i = 0; i < 3; i++) edgeNow[i] += (edgeTarget[i] - edgeNow[i]) * toward

      // Under reduced motion, stop the loop once we've settled back to the wash.
      if (stillRef.current && !simActive) {
        draw()
        lastDrawAt = now
        return
      }

      frame = requestAnimationFrame(loop)

      // Idle in wash mode, cap to ~30fps regardless of display refresh rate.
      if (!simActive && !moved && !settling && stir < 0.01 && now - lastDrawAt < IDLE_FRAME_MS) {
        return
      }
      draw()
      lastDrawAt = now
    }

    const startLoop = () => {
      if (lost || frame || document.hidden) return
      if (stillRef.current && !simulationRef.current && simMix <= 0.001) {
        draw()
        return
      }
      last = performance.now()
      frame = requestAnimationFrame(loop)
    }
    kickLoopRef.current = startLoop

    // Mouse and pen in wash mode (a finger on a phone is scrolling); touch also
    // steers gently while inside the tunnel simulation.
    const onPointerMove = (event: PointerEvent) => {
      if (stillRef.current && !simulationRef.current) return
      if (event.pointerType === "touch" && !simulationRef.current) return
      const x = (event.clientX - canvasBox.left) / canvasBox.height
      const y = (event.clientY - canvasBox.top) / canvasBox.height
      if (!pointerSeen) {
        // First sighting: start the eased cursor here, so the swirl fades in
        // where the mouse is instead of sliding over from the corner.
        pointerSeen = true
        pointer.x = x
        pointer.y = y
      } else {
        pointerTravel += Math.hypot(x - target.x, y - target.y)
      }
      target.x = x
      target.y = y
      target.presence = 1
    }
    const onPointerGone = () => {
      target.presence = 0
    }

    // Clicking or tapping anywhere in the tunnel launches a single 3D surface
    // wave directly from the wall spot under the pointer.
    const onPointerDown = (event: PointerEvent) => {
      if (!simulationRef.current) return
      if (event.pointerType === "mouse" && event.button !== 0) return
      measureBox()
      const aspect = canvasBox.width / canvasBox.height
      const uvX = (event.clientX - canvasBox.left) / canvasBox.width
      const uvY = 1 - (event.clientY - canvasBox.top) / canvasBox.height
      const suvX = (uvX - 0.5) * aspect
      const suvY = uvY - 0.5

      const [hitAngle, hitZ, angWeight] = raycastTunnelWall(
        suvX,
        suvY,
        simZ,
        surge,
      )

      if (activePingCount >= PING_COUNT) {
        pingsData.copyWithin(0, 4)
        activePingCount = PING_COUNT - 1
      }
      const offset = activePingCount * 4
      pingsData[offset] = hitAngle
      pingsData[offset + 1] = hitZ
      pingsData[offset + 2] = simTime
      pingsData[offset + 3] = angWeight
      activePingCount += 1
      pingsDirty = true
      surge = Math.min(1, surge + 0.5)

      // Update cursor target so touch taps also swirl softly where you tapped.
      const x = (event.clientX - canvasBox.left) / canvasBox.height
      const y = (event.clientY - canvasBox.top) / canvasBox.height
      if (!pointerSeen) {
        pointerSeen = true
        pointer.x = x
        pointer.y = y
      }
      target.x = x
      target.y = y
      target.presence = 1
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
      } else {
        startLoop()
      }
    }

    // A lost context draws nothing and reads back nothing. Stop, hand the
    // page back its own background and let the CSS gradient show, and ask for
    // the context back; when it returns, everything is built again on it.
    const onContextLost = (event: Event) => {
      event.preventDefault()
      lost = true
      cancelAnimationFrame(frame)
      frame = 0
      pending = null
      packBufferWidth = 0
      delete canvas.dataset.ready
      root.style.removeProperty("background-color")
    }
    const onContextRestored = () => setContextGeneration((generation) => generation + 1)
    canvas.addEventListener("webglcontextlost", onContextLost)
    canvas.addEventListener("webglcontextrestored", onContextRestored)
    canvas.addEventListener("pointerdown", onPointerDown)

    const observer = new ResizeObserver(() => {
      measureBox()
      if (stillRef.current && !simulationRef.current && simMix <= 0.001) draw()
    })
    observer.observe(canvas)

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onPointerGone)
    window.addEventListener("blur", onPointerGone)
    document.addEventListener("visibilitychange", onVisibilityChange)
    startLoop()

    return () => {
      kickLoopRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", onContextRestored)
      canvas.removeEventListener("pointerdown", onPointerDown)
      // Other pages keep their own background.
      root.style.removeProperty("background-color")
      window.removeEventListener("pointermove", onPointerMove)
      document.documentElement.removeEventListener("mouseleave", onPointerGone)
      window.removeEventListener("blur", onPointerGone)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      // Objects from a lost context belong to nothing now; leave them be.
      if (!lost && !gl.isContextLost()) {
        if (pending) gl.deleteSync(pending)
        gl.deleteBuffer(packBuffer)
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
      }
      // No WEBGL_lose_context: it is permanent for the canvas, so StrictMode's
      // second mount would inherit a context that can never draw.
    }
  }, [contextGeneration])

  return (
    <div
      className={`${styles.container} ${simulation ? styles.containerSimulation : ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
