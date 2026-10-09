// The frame on the tube: bright blocks bleed a soft halo into their
// neighbours, the columns and rows sit a shade off one another, the slot
// mask's staggered bricks lie over everything, and the grain never holds still.

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
// 0 off, 1 slot mask, 2 aperture grille.
uniform int uMask;
uniform float uMaskStrength;
// One brick of the mask, in device pixels, rounded to whole pixels so the
// pattern never beats against the screen's own.
uniform vec2 uMaskCell;
uniform float uGlow;
uniform float uGrain;
uniform float uBanding;
uniform float uVignette;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Measured off the references, on a 4K grid: bricks 8 pixels wide and 12
// tall, every other row shifted half a brick, a dark slit two pixels wide
// down one side of each. The slits starve green first, so they read magenta.
vec3 slotMask(vec2 pixel) {
  float row = floor(pixel.y / uMaskCell.y);
  float x = pixel.x + 0.5 * uMaskCell.x * mod(row, 2.0);
  float across = fract(x / uMaskCell.x) * 8.0;
  float up = fract(pixel.y / uMaskCell.y) * 12.0;
  // Reference pixels to a device pixel, to antialias at any size.
  float aa = 0.5 * 8.0 / uMaskCell.x;
  float slit = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(across - 2.5));
  float seam = 1.0 - smoothstep(0.0, 1.0 + aa, min(up, 12.0 - up));
  vec3 tint = vec3(0.45, 1.0, 0.45);
  vec3 mask = 1.0 - uMaskStrength * (slit * tint + 0.08 * seam);
  // The slit covers a quarter of each brick and the seam a sliver; keep the mean.
  return mask / (1.0 - uMaskStrength * (0.25 * tint + 0.01));
}

// Unbroken vertical stripes of red, green and blue phosphor.
vec3 grilleMask(vec2 pixel) {
  float across = fract(pixel.x / uMaskCell.x) * 3.0;
  vec3 stripe = max(1.0 - abs(across - vec3(0.5, 1.5, 2.5)), 0.0);
  stripe += max(1.0 - abs(across + 0.5), 0.0) * vec3(0.0, 0.0, 1.0);
  stripe += max(1.0 - abs(across - 3.5), 0.0) * vec3(1.0, 0.0, 0.0);
  // Each stripe averages a third of the period; keep the mean.
  return 1.0 - uMaskStrength + uMaskStrength * 3.0 * stripe;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 color = texture(uImage, uv).rgb;

  vec3 halo = 0.5 * (textureLod(uImage, uv, 3.0).rgb + textureLod(uImage, uv, 5.0).rgb);
  color += uGlow * halo * halo;

  float column = hash(vec2(floor(uv.x * 36.0), uSeed)) - 0.5;
  float row = hash(vec2(uSeed, floor(uv.y * 20.0))) - 0.5;
  color *= 1.0 + uBanding * (column + 0.5 * row);

  if (uMask == 1) color *= slotMask(gl_FragCoord.xy);
  else if (uMask == 2) color *= grilleMask(gl_FragCoord.xy);

  vec2 fromCentre = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  color *= 1.0 - uVignette * smoothstep(0.3, 1.1, length(fromCentre));

  // Mostly brightness, a little colour, new every film frame.
  vec2 at = gl_FragCoord.xy + mod(floor(uTime * 24.0), 64.0) * vec2(37.0, 61.0);
  float mono = hash(at) - 0.5;
  vec3 tint = vec3(hash(at + 11.0), hash(at + 23.0), hash(at + 41.0)) - 0.5;
  color += uGrain * (0.8 * mono + 0.35 * tint);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
