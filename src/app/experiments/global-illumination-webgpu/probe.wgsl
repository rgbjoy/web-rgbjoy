// One update of the probe volume. Rather than one thread per probe sending
// all of its rays one after another, each probe gets a workgroup of 64
// invocations that send its rays side by side, then
// add their harmonics up in workgroup memory. A few thousand probes become a
// couple of hundred thousand rays in flight, which is the work a GPU is
// built for.
//
// Each ray lights whatever it lands on — with last update's probes standing
// in for the light that reaches there by bouncing, so every update adds a
// bounce — and the sum folds into the probe's running estimate.

struct ProbeUpdate {
  /** A fresh random turn each update, so the rays sweep new directions. */
  rotation: mat3x3f,
  rays: u32,
  /** How much of this update goes into each probe's running estimate. */
  weight: f32,
}

@group(1) @binding(0) var<uniform> update: ProbeUpdate;
@group(1) @binding(1) var<storage, read_write> updated: array<Probe>;

const LANES = 64u;
/** How far a probe keeps from the nearest surface. */
const PROBE_CLEARANCE = 0.12;
const PI = 3.14159265359;

var<workgroup> sumRed: array<vec4f, LANES>;
var<workgroup> sumGreen: array<vec4f, LANES>;
var<workgroup> sumBlue: array<vec4f, LANES>;

/** The i-th of n points spread evenly over the sphere (spherical Fibonacci). */
fn fibonacciSphere(i: u32, n: u32) -> vec3f {
  let k = f32(i) + 0.5;
  let phi = 2.39996322973 * k;
  let cosTheta = 1.0 - 2.0 * k / f32(n);
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  return vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
}

/** Light coming back along a probe's ray. */
fn probeRay(origin: vec3f, rd: vec3f) -> vec3f {
  let t = castCamera(origin, rd);
  if (t < 0.0) { return sky(rd); }
  let p = origin + rd * t;
  let n = normalAt(p);
  return radianceAt(p, n, probeLight(p, n));
}

// One workgroup per probe, dispatched exactly PROBE_COUNT wide.
@compute @workgroup_size(LANES)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
  let index = group.x;
  let i = i32(index);
  let cell = vec3i(i % PROBE_GRID.x, (i / PROBE_GRID.x) % PROBE_GRID.y, i / (PROBE_GRID.x * PROBE_GRID.y));

  // A probe just under a surface, or too close to one to see past it, is
  // nudged out along the field's gradient (DDGI's probe relocation). One
  // buried deeper than that would have to move into the next cell: it's
  // left out. Every lane works this out the same, which is cheaper than
  // having one share it.
  var probe = probeCellPosition(cell);
  var offset = vec3f(0.0);
  let d = sceneDistance(probe);
  if (d < PROBE_CLEARANCE) { offset = normalAt(probe) * (PROBE_CLEARANCE - d); }
  let usable = length(offset) < 0.45 * PROBE_SPACING && sceneDistance(probe + offset) > 0.5 * PROBE_CLEARANCE;
  probe += offset;

  var red = vec4f(0.0);
  var green = vec4f(0.0);
  var blue = vec4f(0.0);
  if (usable) {
    for (var ray = lane; ray < update.rays; ray += LANES) {
      let rd = update.rotation * fibonacciSphere(ray, update.rays);
      let light = probeRay(probe, rd);
      // Projected onto Y00 and Y1, in the same x, y, z order shIrradiance reads.
      let basis = vec4f(0.282095, 0.488603 * rd);
      red += light.r * basis;
      green += light.g * basis;
      blue += light.b * basis;
    }
  }

  // Halve the lanes until lane 0 holds the whole workgroup's sum.
  sumRed[lane] = red;
  sumGreen[lane] = green;
  sumBlue[lane] = blue;
  workgroupBarrier();
  for (var stride = LANES / 2u; stride > 0u; stride >>= 1u) {
    if (lane < stride) {
      sumRed[lane] += sumRed[lane + stride];
      sumGreen[lane] += sumGreen[lane + stride];
      sumBlue[lane] += sumBlue[lane + stride];
    }
    workgroupBarrier();
  }

  if (lane == 0u) {
    let solidAngle = 4.0 * PI / f32(update.rays);
    let before = probes[index];
    var after: Probe;
    after.red = mix(before.red, sumRed[0] * solidAngle, update.weight);
    after.green = mix(before.green, sumGreen[0] * solidAngle, update.weight);
    after.blue = mix(before.blue, sumBlue[0] * solidAngle, update.weight);
    after.placement = vec4f(select(0.0, 1.0, usable), offset);
    updated[index] = after;
  }
}
