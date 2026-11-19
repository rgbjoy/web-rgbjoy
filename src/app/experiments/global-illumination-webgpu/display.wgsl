// The accumulated light with its highlights glowing, filmic tone-mapped to
// the screen and darkened toward the corners. Joined after a line that sets
// BLOOM_LEVELS.

struct Display {
  resolution: vec2f,
  bloomStrength: f32,
  exposure: f32,
}

@group(0) @binding(0) var<uniform> display: Display;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var bloom: texture_2d<f32>;
@group(0) @binding(3) var bilinear: sampler;

@vertex fn fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// three.js's ACES fit (Stephen Hill's RRT + ODT approximation).
const ACES_INPUT = mat3x3f(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777,
);
const ACES_OUTPUT = mat3x3f(
  1.60475, -0.10208, -0.00327,
  -0.53108, 1.10813, -0.07276,
  -0.07367, -0.00605, 1.07602,
);

fn rrtAndOdtFit(v: vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

fn acesFilmic(hdr: vec3f) -> vec3f {
  let color = ACES_OUTPUT * rrtAndOdtFit(ACES_INPUT * (hdr * display.exposure / 0.6));
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn linearToSRGB(c: vec3f) -> vec3f {
  return select(c * 12.92, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c >= vec3f(0.0031308));
}

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  // The traced pictures run bottom-up; the screen runs top-down.
  let coord = vec2f(position.x, display.resolution.y - position.y);
  let hdr = max(textureLoad(image, vec2i(coord), 0).rgb, vec3f(0.0));
  let uv = coord / display.resolution;
  // Every bloom level is summed into the first; share them out evenly.
  let glow = textureSampleLevel(bloom, bilinear, uv, 0.0).rgb / f32(BLOOM_LEVELS);
  var light = hdr + glow * display.bloomStrength;
  // A soft vignette, so the eye settles on the lit middle of the room.
  let fromCentre = (uv - 0.5) * vec2f(display.resolution.x / display.resolution.y, 1.0);
  light *= 1.0 - 0.45 * smoothstep(0.35, 1.05, length(fromCentre));
  var color = linearToSRGB(acesFilmic(light));
  // Half a step of dither so the dim walls don't band once the noise is gone.
  color += (hash(coord) - 0.5) / 255.0;
  return vec4f(color, 1.0);
}
