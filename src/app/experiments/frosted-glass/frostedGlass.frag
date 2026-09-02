#ifdef GL_ES
precision highp float;
#endif

// Frosted Glass — capsules and beads tumble in a shallow slab behind a pane.
// Nothing is rasterised: every grain arrives as a line segment plus a radius and
// is drawn analytically as a 2D capsule, which is exactly what a 3D capsule
// projects to when the view is orthographic. The distance from a grain's surface
// to the glass then does all the work — it widens the edge falloff and hands the
// haze more of the grain to eat, so depth reads as blur rather than as scale.
//
// MAX_GRAINS is injected as a #define so the array length has one source of
// truth on the TypeScript side.

uniform vec2 uResolution;
uniform float uTime;
/** Half the visible height in world metres; sets the world-to-screen mapping. */
uniform float uHalfHeight;
uniform float uFloorY;

uniform int uCount;
/** xy = end A, z = depth of end A below the glass, w = radius. */
uniform vec4 uSegA[MAX_GRAINS];
/** xy = end B, z = depth of end B below the glass, w = fade in/out. */
uniform vec4 uSegB[MAX_GRAINS];

uniform float uBlurNear;
uniform float uBlurPerDepth;
uniform float uHaze;
uniform float uMinDensity;
uniform float uGrain;
uniform float uFrost;

uniform vec3 uInk;
uniform vec3 uGlassTop;
uniform vec3 uGlassBottom;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 pane(vec2 p, float aspect) {
  vec3 base = mix(
    uGlassBottom,
    uGlassTop,
    clamp(p.y / uHalfHeight * 0.5 + 0.5, 0.0, 1.0)
  );

  // A broad, soft source off the upper right — a window somewhere across the
  // room rather than a light in the box.
  vec2 toLight = (p - vec2(uHalfHeight * aspect * 0.55, uHalfHeight * 0.75))
    / (uHalfHeight * 2.6);
  base += exp(-dot(toLight, toLight)) * 0.03;

  // Frost dapple. Two octaves, both barely there: enough that the pane is never
  // a flat field, not enough to read as texture.
  float dapple = valueNoise(p * 3.1) * 0.6 + valueNoise(p * 8.3) * 0.4;
  base *= 1.0 - (dapple - 0.5) * uFrost;

  vec2 corner = p / vec2(uHalfHeight * aspect, uHalfHeight);
  base *= 1.0 - 0.07 * smoothstep(0.5, 1.4, length(corner));

  // The sill the pile rests on, seen edge on: a hairline and nothing more.
  float sill = 1.0 - smoothstep(0.0, 0.006, abs(p.y - uFloorY));
  base = mix(base, mix(base, uInk, 0.3), sill);

  return base;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * 2.0 * vec2(uHalfHeight * aspect, uHalfHeight);

  vec3 color = pane(p, aspect);

  // The grains arrive sorted back to front, so a straight mix per grain is a
  // correct over-composite — no depth buffer, no second pass.
  for (int i = 0; i < MAX_GRAINS; i++) {
    if (i >= uCount) break;

    vec4 a = uSegA[i];
    vec4 b = uSegB[i];
    float radius = a.w;
    float farBlur = uBlurNear + uBlurPerDepth * max(a.z, b.z);

    // Most pixels are nowhere near most grains. One bounding test up front is
    // what keeps a 40-grain loop affordable at full resolution.
    vec2 offset = p - 0.5 * (a.xy + b.xy);
    float reach = 0.5 * length(b.xy - a.xy) + radius + farBlur * 2.0;
    if (dot(offset, offset) > reach * reach) continue;

    vec2 axis = b.xy - a.xy;
    float span = dot(axis, axis);
    float h = span > 1e-8 ? clamp(dot(p - a.xy, axis) / span, 0.0, 1.0) : 0.0;
    float dist = length(p - (a.xy + axis * h)) - radius;

    // A tilted capsule has one end nearer the glass than the other, so blur and
    // haze are resolved at the point on the axis this pixel actually sees.
    float depth = mix(a.z, b.z, h);
    float blur = uBlurNear + uBlurPerDepth * depth;

    // Blur spreads a fixed amount of ink over a wider area. Once the smear is
    // wider than the grain itself, the centre stops reaching full opacity —
    // which is why the deep ones read as stains rather than as soft shapes.
    float peak = radius / (radius + max(blur - radius, 0.0));
    float cover = (1.0 - smoothstep(-blur, blur, dist)) * peak;
    float density = mix(1.0, uMinDensity, clamp(depth * uHaze, 0.0, 1.0));

    color = mix(color, uInk, cover * density * b.w);
  }

  // Dither. These gradients are shallow enough to band on an 8-bit display.
  color += (hash21(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5) * uGrain;

  gl_FragColor = vec4(color, 1.0);
}
