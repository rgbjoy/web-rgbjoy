// High precision where the device has it: the grain hash shows patterns at medium precision.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
// The cursor in canvas pixels (origin bottom left), and how much it's felt, 0 to 1. Both eased in JS.
uniform vec2 uPointer;
uniform float uPull;

const int RAYS = 14;
// Down and to the left, away from the top right corner.
const float AIM = -2.4;
const vec2 SOURCE = vec2(0.35, 0.3);

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Dave Hoskins' hash without sine: no diagonal banding or repeating structure.
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Film grain from -1 to 1, bunched toward 0 like real grain (two samples summed),
// re-rolled 24 times a second, like frames of film rather than a constant fizz.
float grain(vec2 pixel, float t) {
  vec2 frame = vec2(17.31, 29.77) * floor(t * 24.0);
  return hash2(pixel + frame) + hash2(pixel + frame + vec2(57.0, 113.0)) - 1.0;
}

// A soft swell of light that drifts out along a ray: feathered at both ends,
// easing in as it leaves the corner and out as it goes. Each ray keeps its own pace.
float shot(float r, float f, float t) {
  float speed = 0.04 + 0.03 * hash(f + 11.0);
  float phase = fract(t * speed + hash(f + 5.0));
  float head = mix(-0.4, 2.6, phase);
  float along = (r - head) / 0.45;
  return exp(-along * along) * sin(phase * 3.14159) * 1.3;
}

// Light at angle `a` from every ray, each with its own heading, width and flicker.
// Rays near the cursor's angle lean toward it and brighten, by `pull`.
float rays(float a, float r, float t, float aim, float pull) {
  float light = 0.0;
  // Rays widen toward the source, so it's a soft haze rather than a point they all meet at.
  float spread = 1.0 + 3.0 * exp(-r * 2.2);
  for (int i = 0; i < RAYS; i++) {
    float f = float(i);
    float heading = AIM + (hash(f) - 0.5) * 1.1 + 0.04 * sin(t * 0.15 + f * 1.9);
    float near = pull * exp(-pow((heading - aim) / 0.35, 2.0));
    heading = mix(heading, aim, 0.175 * near);
    float width = (0.012 + 0.05 * hash(f + 7.0)) * spread;
    float strength = (0.35 + 0.65 * hash(f + 3.0)) * (1.0 + 0.45 * near);
    float d = (a - heading) / width;
    light += strength * (0.12 + shot(r, f, t)) * exp(-d * d);
  }
  // The same light spread wider, not more of it.
  return light / sqrt(spread);
}

// Holographic foil: a full turn of the spectrum, the way thin film throws
// colour, from cyan through violet and magenta to gold and back.
vec3 foil(float hue) {
  vec3 colour = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
  // A touch of white, so the colours read as metal catching light, not paint.
  return mix(colour, vec3(1.0), 0.08);
}

void main() {
  // Origin just past the top right corner, measured in heights so rays keep their shape at any width.
  // Starting off canvas means the rays arrive already spread, not pinched to a point.
  vec2 p = (gl_FragCoord.xy - uResolution) / uResolution.y - SOURCE;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime;

  // The cursor's angle from the source, felt less the further it is from the light.
  vec2 cursor = (uPointer - uResolution) / uResolution.y - SOURCE;
  float aim = atan(cursor.y, cursor.x);
  float pull = uPull * smoothstep(2.6, 0.8, length(cursor));

  float light = rays(a, r, t, aim, pull);
  // Brightest near the corner, gone before it reaches the content.
  light *= smoothstep(2.3, 0.6, r);
  // Rolled off rather than clipped, so overlapping swells glow brighter without blowing out.
  light = 0.85 * (1.0 - exp(-light));
  // A faint sheen around the source, so the foil is there between the rays too.
  light += 0.22 * exp(-r * 1.7);

  // Colour runs in bands along each ray and across them, drifting, like
  // light sliding over foil. The cursor tips the sheet: rays turned toward it
  // shift further round the wheel.
  float hue = r * 1.35 + a * 1.2 + t * 0.025 + 0.12 * sin(r * 6.0 - t * 0.4);
  hue += 0.25 * pull * cos(a - aim);
  vec3 colour = foil(hue);

  // Film grain, fresh every frame: stronger in the light, and a faint speckle between rays.
  float noise = grain(gl_FragCoord.xy, t);
  float alpha = clamp(light * 0.78 + noise * 0.05 * (0.3 + light), 0.0, 1.0);
  // Premultiplied, as the canvas is: tinted colour over the paper beneath.
  gl_FragColor = vec4(colour * alpha, alpha);
}
