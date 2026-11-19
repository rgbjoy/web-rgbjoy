// The scene both compute passes share: a concrete box in the sky with one
// window, two spheres, a block, a chrome torus and a striped plus tumbling in
// the sun, as a signed distance field with exact shortcuts for the room's inside; the
// sun and its shadows; and the probe volume that stores the light bouncing
// around the room. Joined after the constants layout.ts writes from room.ts,
// plus.ts and probes.ts, and ahead of trace.wgsl or probe.wgsl.

struct Scene {
  lightPosition: vec3f,
  shadowSoftness: f32,
  emissive: vec3f,
  ambient: f32,
  // Where the movable objects are: two sphere centres, and the block's and
  // the torus's centres and world-to-local rotations.
  glowCenter: vec3f,
  pebbleCenter: vec3f,
  blockCenter: vec3f,
  torusCenter: vec3f,
  blockInverse: mat3x3f,
  torusInverse: mat3x3f,
  // The plus turns every frame while it's animating.
  plusCenter: vec3f,
  plusInverse: mat3x3f,
}

// One probe of the volume: the light arriving from every direction as linear
// spherical harmonics per colour channel, then whether it can be used (x) and
// how far it was moved to clear a surface (yzw).
struct Probe {
  red: vec4f,
  green: vec4f,
  blue: vec4f,
  placement: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;
// Last update's probes. The probe pass writes the next ones elsewhere.
@group(0) @binding(1) var<storage, read> probes: array<Probe>;

const MAT_WALL = 0;
const MAT_FLOOR = 1;
const MAT_GLOW = 2;
const MAT_PEBBLE = 3;
const MAT_BLOCK = 4;
const MAT_CHROME = 5;
const MAT_PLUS = 6;

// A closed concrete box floating in the sky, lit only through one square
// window in its +x wall.
const SHELL_HALF = ROOM_HALF + WALL;
const INNER_X = ROOM_HALF.x;
const OUTER_X = ROOM_HALF.x + WALL;

const SUN = vec3f(1.0, 0.9, 0.78) * 3.4;
const SKY_ZENITH = vec3f(0.05, 0.19, 0.62);
const SKY_HORIZON = vec3f(0.24, 0.45, 0.92);
// Flat fill for the bounces past the first; kept low so the traced bounce leads.
const AMBIENT_TINT = vec3f(0.86, 0.9, 1.0) * 0.35;
// Polished chrome reflects most of what reaches it, a little cool, and all
// of it at a glancing angle.
const CHROME = vec3f(0.8, 0.81, 0.83);
// What the rest of the room gets back from the torus. A mirror sends each ray
// on in one direction, which a matte bounce can't follow; on average it
// returns about what it reflects, so that's the colour it bounces as.
const CHROME_DIFFUSE = vec3f(0.6);
// The plus is green's opposite, so it stands apart from everything else in
// the room, striped with cream so its turning reads at a glance.
const PLUS_MAGENTA = vec3f(0.72, 0.06, 0.42);
const PLUS_CREAM = vec3f(0.86, 0.82, 0.74);

/** Whether every component is a real number: WGSL has no isnan, and may assume NaN away in float maths. */
fn finite(v: vec3f) -> bool {
  return all((bitcast<vec3u>(v) & vec3u(0x7f800000u)) != vec3u(0x7f800000u));
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/** Where a ray enters and leaves an axis-aligned box; empty when x > y. */
fn boxSpan(ro: vec3f, rd: vec3f, centre: vec3f, halfSize: vec3f) -> vec2f {
  let inv = 1.0 / rd;
  let a = (centre - halfSize - ro) * inv;
  let b = (centre + halfSize - ro) * inv;
  let lo = min(a, b);
  let hi = max(a, b);
  return vec2f(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

fn shellSpan(ro: vec3f, rd: vec3f) -> vec2f {
  return boxSpan(ro, rd, ROOM_CENTER, SHELL_HALF);
}

fn sky(rd: vec3f) -> vec3f {
  return mix(SKY_HORIZON, SKY_ZENITH, smoothstep(-0.1, 0.9, rd.y));
}

fn toBlock(p: vec3f) -> vec3f {
  return scene.blockInverse * (p - scene.blockCenter);
}

fn toTorus(p: vec3f) -> vec3f {
  return scene.torusInverse * (p - scene.torusCenter);
}

fn toPlus(p: vec3f) -> vec3f {
  return scene.plusInverse * (p - scene.plusCenter);
}

/** The plus in its own frame: a bar along x crossed with one along y, edges rounded. */
fn plusDistance(q: vec3f) -> f32 {
  let r = PLUS_ROUNDING;
  let across = sdBox(q, vec3f(PLUS_ARM, PLUS_BAR, PLUS_BAR) - r);
  let upright = sdBox(q, vec3f(PLUS_BAR, PLUS_ARM, PLUS_BAR) - r);
  return min(across, upright) - r;
}

/** The chrome torus in its own frame, lying flat around its y axis. room.ts picks against the same. */
fn torusDistance(q: vec3f) -> f32 {
  return length(vec2f(length(q.xz) - TORUS_RADIUS, q.y)) - TORUS_TUBE;
}

fn buildingDistance(p: vec3f) -> f32 {
  let q = p - ROOM_CENTER;
  let shell = max(sdBox(q, SHELL_HALF), -sdBox(q, ROOM_HALF));
  let opening = sdBox(p - vec3f(INNER_X + WALL * 0.5, WINDOW.xy), vec3f(WALL, WINDOW.zw));
  return max(shell, -opening);
}

fn sceneDistance(p: vec3f) -> f32 {
  var d = buildingDistance(p);
  d = min(d, length(p - scene.glowCenter) - GLOW_RADIUS);
  d = min(d, length(p - scene.pebbleCenter) - PEBBLE_RADIUS);
  d = min(d, sdBox(toBlock(p), BLOCK_HALF) - BLOCK_ROUNDING);
  d = min(d, torusDistance(toTorus(p)));
  d = min(d, plusDistance(toPlus(p)));
  return d;
}

fn materialAt(p: vec3f) -> i32 {
  var best = buildingDistance(p);
  var id = select(MAT_WALL, MAT_FLOOR, abs(p.y) < 0.02);
  let glow = length(p - scene.glowCenter) - GLOW_RADIUS;
  if (glow < best) { best = glow; id = MAT_GLOW; }
  let pebble = length(p - scene.pebbleCenter) - PEBBLE_RADIUS;
  if (pebble < best) { best = pebble; id = MAT_PEBBLE; }
  let block = sdBox(toBlock(p), BLOCK_HALF) - BLOCK_ROUNDING;
  if (block < best) { best = block; id = MAT_BLOCK; }
  let torus = torusDistance(toTorus(p));
  if (torus < best) { best = torus; id = MAT_CHROME; }
  if (plusDistance(toPlus(p)) < best) { id = MAT_PLUS; }
  return id;
}

struct Surface {
  albedo: vec3f,
  emission: vec3f,
}

// Diagonal stripes in the plus's own frame, so they turn with it. Their edges
// are softened a touch: while the plus turns there are no frames to average,
// and a hard edge would crawl.
fn plusStripes(p: vec3f) -> vec3f {
  let q = toPlus(p);
  let band = abs(fract((q.x + q.y + 0.5 * q.z) * PLUS_STRIPES) - 0.5) * 2.0;
  return mix(PLUS_MAGENTA, PLUS_CREAM, smoothstep(0.44, 0.56, band));
}

fn surface(id: i32, p: vec3f) -> Surface {
  switch id {
    case MAT_FLOOR: { return Surface(vec3f(0.36, 0.35, 0.34), vec3f(0.0)); }
    case MAT_GLOW: { return Surface(vec3f(0.85, 0.72, 0.62), scene.emissive); }
    // Saturated enough that their colour carries into the light they bounce.
    case MAT_PEBBLE: { return Surface(vec3f(0.3, 0.8, 0.22), vec3f(0.0)); }
    case MAT_BLOCK: { return Surface(vec3f(0.08, 0.3, 0.9), vec3f(0.0)); }
    case MAT_CHROME: { return Surface(CHROME_DIFFUSE, vec3f(0.0)); }
    case MAT_PLUS: { return Surface(plusStripes(p), vec3f(0.0)); }
    // Mid-grey walls: pale ones would bounce so much neutral light around
    // that every colour washed out in it.
    default: { return Surface(vec3f(0.42, 0.4, 0.38), vec3f(0.0)); }
  }
}

fn normalAt(p: vec3f) -> vec3f {
  let k = vec2f(1.0, -1.0);
  let h = 0.0015;
  return normalize(
    k.xyy * sceneDistance(p + k.xyy * h) +
    k.yyx * sceneDistance(p + k.yyx * h) +
    k.yxy * sceneDistance(p + k.yxy * h) +
    k.xxx * sceneDistance(p + k.xxx * h)
  );
}

/** How far a point on the window wall's plane is from the opening; ≤ 0 inside it. */
fn windowMiss(yz: vec2f) -> f32 {
  let q = abs(yz - WINDOW.xy) - WINDOW.zw;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
}

// Soft occlusion by a sphere along a ray, from how widely the ray clears it
// relative to the distance — the analytic twin of the marched penumbra.
fn sphereShadow(p: vec3f, rd: vec3f, centre: vec3f, radius: f32, k: f32) -> f32 {
  let toCentre = centre - p;
  let along = dot(toCentre, rd);
  if (along <= 0.0) { return 1.0; }
  let clearance = length(toCentre - rd * along) - radius;
  return smoothstep(-1.0, 1.0, k * clearance / along);
}

fn blockShadow(p: vec3f, rd: vec3f) -> f32 {
  let span = boxSpan(toBlock(p), scene.blockInverse * rd, vec3f(0.0), BLOCK_HALF);
  return select(1.0, 0.0, span.x <= span.y && span.y > 0.0);
}

/** Whether either of the plus's bars stands between a point and the light; as hard-edged as the block's. */
fn plusShadow(p: vec3f, rd: vec3f) -> f32 {
  let q = toPlus(p);
  let d = scene.plusInverse * rd;
  let across = boxSpan(q, d, vec3f(0.0), vec3f(PLUS_ARM, PLUS_BAR, PLUS_BAR));
  let upright = boxSpan(q, d, vec3f(0.0), vec3f(PLUS_BAR, PLUS_ARM, PLUS_BAR));
  let blocked = (across.x <= across.y && across.y > 0.0) || (upright.x <= upright.y && upright.y > 0.0);
  return select(1.0, 0.0, blocked);
}

/** Where a ray from q crosses the sphere the torus fits in, in the torus's frame; empty when x > y. */
fn torusSpan(q: vec3f, rd: vec3f) -> vec2f {
  let b = dot(q, rd);
  let h = b * b - dot(q, q) + TORUS_REACH * TORUS_REACH;
  if (h < 0.0) { return vec2f(1.0, -1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

// A torus has no handy closed form to shadow with (its hit is a quartic), so
// this one is marched — but only across the sphere it fits in, which most
// sun rays miss altogether. Same penumbra as sunShadow's, from how closely
// the ray grazes the tube.
fn torusShadow(p: vec3f, rd: vec3f, k: f32) -> f32 {
  let q = toTorus(p);
  let d = scene.torusInverse * rd;
  let span = torusSpan(q, d);
  if (span.x > span.y || span.y < 0.0) { return 1.0; }
  var lit = 1.0;
  var t = max(span.x, 0.02);
  for (var i = 0; i < 32; i++) {
    let h = torusDistance(q + d * t);
    lit = min(lit, k * h / t);
    t += clamp(h, 0.01, 0.25);
    if (lit < -1.0 || t > span.y) { break; }
  }
  return smoothstep(-1.0, 1.0, lit);
}

// Sunlight reaching a point inside the room. Nearly all of it analytic — the
// window's aperture, the spheres, the block — so the air march can ask it
// dozens of times a pixel, and the surfaces never need a shadow ray marched
// through the whole room; only the torus's own small sphere is.
fn airVisibility(p: vec3f) -> f32 {
  let rd = normalize(scene.lightPosition - p);
  let k = 1.0 / max(scene.shadowSoftness * 0.005, 0.0005);
  var lit = 1.0;
  if (sdBox(scene.lightPosition - ROOM_CENTER, SHELL_HALF) > 0.0) {
    if (rd.x <= 0.0) { return 0.0; }
    let inner = (INNER_X - p.x) / rd.x;
    let outer = (OUTER_X - p.x) / rd.x;
    let miss = max(windowMiss((p + rd * inner).yz) / inner, windowMiss((p + rd * outer).yz) / outer);
    lit = 1.0 - smoothstep(-1.0, 1.0, k * miss);
    if (lit <= 0.0) { return 0.0; }
  }
  lit *= sphereShadow(p, rd, scene.glowCenter, GLOW_RADIUS, k);
  lit *= sphereShadow(p, rd, scene.pebbleCenter, PEBBLE_RADIUS, k);
  lit *= blockShadow(p, rd);
  lit *= plusShadow(p, rd);
  if (lit <= 0.0) { return 0.0; }
  return lit * torusShadow(p, rd, k);
}

// Penumbrae from how closely the shadow ray grazes everything on its way out
// (Quilez's improved soft shadow). Softness widens the light's apparent size.
fn sunShadow(p: vec3f, n: vec3f) -> f32 {
  let toLight = scene.lightPosition - p;
  var far = length(toLight);
  let rd = toLight / far;
  let ro = p + n * 0.01;
  // The penumbra is k⁻¹ wide per unit of distance.
  let k = 1.0 / max(scene.shadowSoftness * 0.005, 0.0005);

  if (sdBox(scene.lightPosition - ROOM_CENTER, SHELL_HALF) > 0.0) {
    // Inside the room, an outdoor sun only gets in through the window, past
    // the spheres, the block and the torus — which have answers of their
    // own, so there's no march through the room.
    if (sdBox(ro - ROOM_CENTER, ROOM_HALF) < 0.0) { return airVisibility(ro); }

    // Past the building there is nothing left to hit.
    let span = shellSpan(ro, rd);
    if (span.y < 0.05 || span.x > span.y) { return 1.0; }
    far = min(far, span.y + 0.3);
  }

  var lit = 1.0;
  var t = 0.02;
  for (var i = 0; i < 64; i++) {
    let h = sceneDistance(ro + rd * t);
    lit = min(lit, k * h / t);
    t += clamp(h, 0.015, 1.0);
    if (lit < -1.0 || t > far) { break; }
  }
  // A ray that crawled along a surface and never got out is taken as blocked.
  if (t < far) { return 0.0; }
  lit = max(lit, -1.0);
  return 0.25 * (1.0 + lit) * (1.0 + lit) * (2.0 - lit);
}

fn sunlight(p: vec3f, n: vec3f) -> vec3f {
  let facing = dot(n, normalize(scene.lightPosition - p));
  if (facing <= 0.0) { return vec3f(0.0); }
  return SUN * facing * sunShadow(p, n);
}

/** Light leaving a surface point toward whatever is looking at it, given what else arrives there. */
fn radianceAt(p: vec3f, n: vec3f, arriving: vec3f) -> vec3f {
  let s = surface(materialAt(p), p);
  return s.emission + s.albedo * (sunlight(p, n) + AMBIENT_TINT * scene.ambient + arriving);
}

/** Nearest hit of a ray on a sphere from outside it; -1 for a miss. */
fn sphereHit(ro: vec3f, rd: vec3f, centre: vec3f, radius: f32) -> f32 {
  let oc = ro - centre;
  let b = dot(oc, rd);
  let h = b * b - dot(oc, oc) + radius * radius;
  if (h < 0.0) { return -1.0; }
  return -b - sqrt(h);
}

/** Nearest hit on the block from outside it (its rounding ignored); -1 for a miss. */
fn blockHit(ro: vec3f, rd: vec3f) -> f32 {
  let span = boxSpan(toBlock(ro), scene.blockInverse * rd, vec3f(0.0), BLOCK_HALF + BLOCK_ROUNDING);
  return select(-1.0, span.x, span.x <= span.y && span.x > 0.0);
}

/** Nearest hit on the plus from outside it: its two bars as boxes, rounding ignored like the block's; -1 for a miss. */
fn plusHit(ro: vec3f, rd: vec3f) -> f32 {
  let q = toPlus(ro);
  let d = scene.plusInverse * rd;
  let across = boxSpan(q, d, vec3f(0.0), vec3f(PLUS_ARM, PLUS_BAR, PLUS_BAR));
  let upright = boxSpan(q, d, vec3f(0.0), vec3f(PLUS_BAR, PLUS_ARM, PLUS_BAR));
  var t = 1e9;
  if (across.x <= across.y && across.x > 0.0) { t = across.x; }
  if (upright.x <= upright.y && upright.x > 0.0) { t = min(t, upright.x); }
  return select(-1.0, t, t < 1e9);
}

/** Nearest hit on the torus, marched across the sphere it fits in; -1 for a miss. */
fn torusHit(ro: vec3f, rd: vec3f) -> f32 {
  let q = toTorus(ro);
  let d = scene.torusInverse * rd;
  let span = torusSpan(q, d);
  if (span.x > span.y || span.y < 0.0) { return -1.0; }
  var t = max(span.x, 0.0);
  for (var i = 0; i < 64; i++) {
    let h = torusDistance(q + d * t);
    if (h < max(0.0004 * t, 0.0002)) { return t; }
    t += h;
    if (t > span.y) { break; }
  }
  return -1.0;
}

struct RoomCast {
  t: f32,
  throughWindow: bool,
}

// From inside the room the scene is simple enough to hit exactly: the room's
// walls, two spheres, a block and the plus — and the torus, marched only where a ray
// crosses its sphere. Only a ray that leaves through the window needs
// marching through the open, from the opening on.
fn castFromRoom(ro: vec3f, rd: vec3f) -> RoomCast {
  let t = boxSpan(ro, rd, ROOM_CENTER, ROOM_HALF).y;
  let exit = ro + rd * t;
  var nearest = t;
  let glow = sphereHit(ro, rd, scene.glowCenter, GLOW_RADIUS);
  if (glow > 0.0) { nearest = min(nearest, glow); }
  let pebble = sphereHit(ro, rd, scene.pebbleCenter, PEBBLE_RADIUS);
  if (pebble > 0.0) { nearest = min(nearest, pebble); }
  let block = blockHit(ro, rd);
  if (block > 0.0) { nearest = min(nearest, block); }
  let torus = torusHit(ro, rd);
  if (torus > 0.0) { nearest = min(nearest, torus); }
  let plus = plusHit(ro, rd);
  if (plus > 0.0) { nearest = min(nearest, plus); }
  let throughWindow = nearest >= t && exit.x > INNER_X - 0.001 && windowMiss(exit.yz) < 0.0;
  return RoomCast(nearest, throughWindow);
}

fn castCamera(ro: vec3f, rd: vec3f) -> f32 {
  var start = 0.0;
  if (sdBox(ro - ROOM_CENTER, ROOM_HALF) < 0.0) {
    let room = castFromRoom(ro, rd);
    if (!room.throughWindow) { return room.t; }
    start = room.t;
  }

  let span = shellSpan(ro, rd);
  if (span.y < 0.0 || span.x > span.y) { return -1.0; }

  var t = max(span.x - 0.01, start);
  if (sceneDistance(ro) < 0.0) {
    // Orbiting through a wall: see straight through it, like a near clip.
    // Walk out of the solid and on until clear of its far face; stopping
    // right on that face would let the march below "hit" the face it just
    // left, in thin contour lines wherever the last step happened to land.
    for (var i = 0; i < 64; i++) {
      let d = sceneDistance(ro + rd * t);
      if (d > 0.01) { break; }
      t += max(abs(d), 0.05);
    }
  }
  for (var i = 0; i < 100; i++) {
    let d = sceneDistance(ro + rd * t);
    if (d < max(0.0004 * t, 0.0002)) { return t; }
    t += d;
    if (t > span.y) { break; }
  }
  return -1.0;
}


// ---- The probe volume -----------------------------------------------------
// A grid of probes through the room's air, each holding the light arriving
// from every direction as linear spherical harmonics: a constant and a
// gradient per colour channel. That's coarse, but light that has bounced off
// matte walls is coarse too. One storage-buffer entry per probe, in x, then
// y, then z order.

fn probeIndex(cell: vec3i) -> i32 {
  return cell.x + PROBE_GRID.x * (cell.y + PROBE_GRID.y * cell.z);
}

fn probeCellPosition(cell: vec3i) -> vec3f {
  return PROBE_ORIGIN + vec3f(cell) * PROBE_SPACING;
}

/** Light a surface facing n gets from one probe's harmonics, as irradiance / π. */
fn shIrradiance(sh: vec4f, n: vec3f) -> f32 {
  // Y00 and Y1 (0.282095, 0.488603) convolved with the cosine lobe (π, 2π/3), over π.
  return 0.282095 * sh.x + 0.325735 * dot(sh.yzw, n);
}

// Light arriving at a surface by bouncing, read from the eight probes around
// it: trilinear weights, with probes buried in objects left out and probes
// behind the surface faded (they see the other side of it). Looked up a
// little off the surface so a wall doesn't lean on probes inside itself.
// Where most of the eight are buried — right under a sphere — the light
// fades out with them rather than leaning on whichever one is left, which
// would switch on and off in hard-edged patches.
fn probeLight(p: vec3f, n: vec3f) -> vec3f {
  // No probes outside the room; the open sky stands in.
  if (sdBox(p - ROOM_CENTER, ROOM_HALF) > 0.02) { return sky(normalize(n + vec3f(0.0, 0.6, 0.0))); }

  let g = (p + n * 0.2 - PROBE_ORIGIN) / PROBE_SPACING;
  let base = clamp(vec3i(floor(g)), vec3i(0), PROBE_GRID - 2);
  let f = clamp(g - vec3f(base), vec3f(0.0), vec3f(1.0));
  var light = vec3f(0.0);
  var total = 0.0;
  for (var i = 0; i < 8; i++) {
    let offset = vec3i(i & 1, (i >> 1u) & 1, i >> 2u);
    let cell = base + offset;
    let index = probeIndex(cell);
    let placement = probes[index].placement;
    if (placement.x < 0.5) { continue; }
    let tri = mix(1.0 - f, f, vec3f(offset));
    // Facing judged from where the probe actually sits, after relocation.
    let facing = (dot(normalize(probeCellPosition(cell) + placement.yzw - p), n) + 1.0) * 0.5;
    let w = tri.x * tri.y * tri.z * (facing * facing + 0.2);
    let probe = probes[index];
    light += w * vec3f(
      shIrradiance(probe.red, n),
      shIrradiance(probe.green, n),
      shIrradiance(probe.blue, n)
    );
    total += w;
  }
  return max(light / max(total, 0.15), vec3f(0.0));
}

// Probes half a metre apart can't see a sphere's contact shadow, so the
// distance field fills it in (Quilez's five-tap ambient occlusion): step out
// along the normal and see how much nearer than that the nearest surface is.
// Kept short and gentle — reaching further would darken every corner, and
// under the glowing sphere it would darken the very light the sphere gives.
fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var occluded = 0.0;
  var scale = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = 0.05 * f32(i);
    occluded += (h - sceneDistance(p + n * h)) * scale;
    scale *= 0.7;
  }
  return clamp(1.0 - occluded, 0.0, 1.0);
}
