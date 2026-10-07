// One frame of the building: a camera ray, the sun, a bounce path of one or
// two hops per pixel and a march through the sunlit air, each blended into
// the running mean of every frame before it.
//
// The bounce is kept apart from the rest. It is the noisy, costly part, and
// it is smooth: when the camera moves it is carried over from last frame and
// only traced where something new comes into view. Everything sharp — the
// sun, its shadows, the surfaces' colours — is cheap, so it is simply traced
// again, and stays crisp however far the camera swings.

/** Light arriving by bouncing off other surfaces (rgb), and how many samples that mean holds (a). */
layout(location = 0) out vec4 outBounce;
/** Light leaving the surface by every other way (rgb), and the distance to it (a; -1 for sky). */
layout(location = 1) out vec4 outDirect;
/** The surface's colour, averaged over the pixel. */
layout(location = 2) out vec4 outAlbedo;
/** Sunlight the air scatters toward the camera (rgb), and how much of the surface gets through (a). */
layout(location = 3) out vec4 outAir;

uniform sampler2D uBounceHistory;
uniform sampler2D uDirectHistory;
uniform sampler2D uAlbedoHistory;
uniform sampler2D uAirHistory;
uniform sampler2D uBlueNoise;
uniform vec2 uResolution;
uniform int uMode;
/** How much of this frame goes into the running means of everything traced fresh. */
uniform float uWeight;
uniform float uNoiseIndex;
uniform vec2 uJitter;
uniform int uSampling;
uniform int uMarchSteps;
uniform float uMarchJitter;

uniform vec3 uCameraPosition;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uTanHalfFov;
// The camera of the frame the history was traced from.
uniform vec3 uPreviousPosition;
uniform vec3 uPreviousRight;
uniform vec3 uPreviousUp;
uniform vec3 uPreviousForward;

uniform vec3 uLightPosition;
uniform float uShadowSoftness;
uniform float uAmbient;
uniform vec3 uEmissive;
uniform int uBounces;
uniform int uVolumeSteps;
uniform float uVolumeDensity;

#define SAMPLING_BLUE 1
#define MODE_REST 1
#define MODE_MOVING 2
/** Samples after which a surface's bounce light is carried across camera
 *  moves as it is, without tracing it again; resting builds it up the rest
 *  of the way. */
#define SETTLED 64.0
#define MAX_MARCH_STEPS 64
/** How far a bounce ray is meant to reach; the march steps are spread over it.
 *  At 16 steps a stride is exactly one wall thick, so walls hold; fewer steps
 *  and the strides start skipping clean through them. */
#define BOUNCE_REACH 9.6
#define MAX_VOLUME_STEPS 64
/** Henyey–Greenstein asymmetry: the air scatters a little forward, so the
 *  shafts brighten as you look toward the window. */
#define FORWARD_SCATTER 0.35

#define MAT_WALL 0
#define MAT_FLOOR 1
#define MAT_GLOW 2
#define MAT_PEBBLE 3
#define MAT_BLOCK 4

// A closed concrete box floating in the sky, lit only through one square
// window in its +x wall.
const vec3 ROOM_CENTER = vec3(0.0, 2.25, 0.0);
const vec3 ROOM_HALF = vec3(3.5, 2.25, 6.0);
const float WALL = 0.6;
const vec3 SHELL_HALF = ROOM_HALF + WALL;
const float INNER_X = ROOM_HALF.x;
const float OUTER_X = ROOM_HALF.x + WALL;
/** Centre y and z, then half height and half width. */
const vec4 WINDOW = vec4(2.3, -2.0, 1.2, 1.2);

const vec3 GLOW_CENTER = vec3(-1.7, 1.0, -2.7);
const float GLOW_RADIUS = 1.0;
const vec3 PEBBLE_CENTER = vec3(0.2, 0.55, -2.1);
const float PEBBLE_RADIUS = 0.55;
const vec3 BLOCK_CENTER = vec3(2.2, 1.0, -3.6);
const vec3 BLOCK_HALF = vec3(1.0);
const vec2 BLOCK_TURN = vec2(0.939373, 0.342898); // cos, sin of 0.35 rad about y

const vec3 SUN = vec3(1.0, 0.9, 0.78) * 3.4;
const vec3 SKY_ZENITH = vec3(0.05, 0.19, 0.62);
const vec3 SKY_HORIZON = vec3(0.24, 0.45, 0.92);
// Flat fill for the bounces past the first; kept low so the traced bounce leads.
const vec3 AMBIENT_TINT = vec3(0.86, 0.9, 1.0) * 0.35;

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/** Where a ray enters and leaves an axis-aligned box; empty when x > y. */
vec2 boxSpan(vec3 ro, vec3 rd, vec3 centre, vec3 halfSize) {
  vec3 inv = 1.0 / rd;
  vec3 a = (centre - halfSize - ro) * inv;
  vec3 b = (centre + halfSize - ro) * inv;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  return vec2(max(max(near.x, near.y), near.z), min(min(far.x, far.y), far.z));
}

vec2 shellSpan(vec3 ro, vec3 rd) {
  return boxSpan(ro, rd, ROOM_CENTER, SHELL_HALF);
}

vec3 sky(vec3 rd) {
  return mix(SKY_HORIZON, SKY_ZENITH, smoothstep(-0.1, 0.9, rd.y));
}

vec3 toBlock(vec3 p) {
  p -= BLOCK_CENTER;
  return vec3(BLOCK_TURN.x * p.x - BLOCK_TURN.y * p.z, p.y, BLOCK_TURN.y * p.x + BLOCK_TURN.x * p.z);
}

float buildingDistance(vec3 p) {
  vec3 q = p - ROOM_CENTER;
  float shell = max(sdBox(q, SHELL_HALF), -sdBox(q, ROOM_HALF));
  float window = sdBox(p - vec3(INNER_X + WALL * 0.5, WINDOW.xy), vec3(WALL, WINDOW.zw));
  return max(shell, -window);
}

float sceneDistance(vec3 p) {
  float d = buildingDistance(p);
  d = min(d, length(p - GLOW_CENTER) - GLOW_RADIUS);
  d = min(d, length(p - PEBBLE_CENTER) - PEBBLE_RADIUS);
  d = min(d, sdBox(toBlock(p), BLOCK_HALF) - 0.02);
  return d;
}

int materialAt(vec3 p) {
  float best = buildingDistance(p);
  int id = abs(p.y) < 0.02 ? MAT_FLOOR : MAT_WALL;
  float glow = length(p - GLOW_CENTER) - GLOW_RADIUS;
  if (glow < best) { best = glow; id = MAT_GLOW; }
  float pebble = length(p - PEBBLE_CENTER) - PEBBLE_RADIUS;
  if (pebble < best) { best = pebble; id = MAT_PEBBLE; }
  float block = sdBox(toBlock(p), BLOCK_HALF) - 0.02;
  if (block < best) { id = MAT_BLOCK; }
  return id;
}

void surface(int id, out vec3 albedo, out vec3 emission) {
  emission = vec3(0.0);
  if (id == MAT_FLOOR) albedo = vec3(0.36, 0.35, 0.34);
  else if (id == MAT_GLOW) { albedo = vec3(0.85, 0.72, 0.62); emission = uEmissive; }
  // Saturated enough that their colour carries into the light they bounce.
  else if (id == MAT_PEBBLE) albedo = vec3(0.3, 0.8, 0.22);
  else if (id == MAT_BLOCK) albedo = vec3(0.08, 0.3, 0.9);
  // Mid-grey walls: pale ones would bounce so much neutral light around
  // that every colour washed out in it.
  else albedo = vec3(0.42, 0.4, 0.38);
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(
    k.xyy * sceneDistance(p + k.xyy * h) +
    k.yyx * sceneDistance(p + k.yyx * h) +
    k.yxy * sceneDistance(p + k.yxy * h) +
    k.xxx * sceneDistance(p + k.xxx * h)
  );
}

/** How far a point on the window wall's plane is from the opening; ≤ 0 inside it. */
float windowMiss(vec2 yz) {
  vec2 q = abs(yz - WINDOW.xy) - WINDOW.zw;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// Soft occlusion by a sphere along a ray, from how widely the ray clears it
// relative to the distance — the analytic twin of the marched penumbra.
float sphereShadow(vec3 p, vec3 rd, vec3 centre, float radius, float k) {
  vec3 toCentre = centre - p;
  float along = dot(toCentre, rd);
  if (along <= 0.0) return 1.0;
  float clearance = length(toCentre - rd * along) - radius;
  return smoothstep(-1.0, 1.0, k * clearance / along);
}

float blockShadow(vec3 p, vec3 rd) {
  vec3 dir = vec3(BLOCK_TURN.x * rd.x - BLOCK_TURN.y * rd.z, rd.y, BLOCK_TURN.y * rd.x + BLOCK_TURN.x * rd.z);
  vec2 span = boxSpan(toBlock(p), dir, vec3(0.0), BLOCK_HALF);
  return span.x <= span.y && span.y > 0.0 ? 0.0 : 1.0;
}

// Sunlight reaching a point inside the room. All of it analytic — the
// window's aperture, the spheres, the block — so the air march can ask it
// dozens of times a pixel, and the surfaces never need a shadow ray marched.
float airVisibility(vec3 p) {
  vec3 rd = normalize(uLightPosition - p);
  float k = 1.0 / max(uShadowSoftness * 0.005, 0.0005);
  float lit = 1.0;
  if (sdBox(uLightPosition - ROOM_CENTER, SHELL_HALF) > 0.0) {
    if (rd.x <= 0.0) return 0.0;
    float inner = (INNER_X - p.x) / rd.x;
    float outer = (OUTER_X - p.x) / rd.x;
    float miss = max(windowMiss((p + rd * inner).yz) / inner, windowMiss((p + rd * outer).yz) / outer);
    lit = smoothstep(1.0, -1.0, k * miss);
    if (lit <= 0.0) return 0.0;
  }
  lit *= sphereShadow(p, rd, GLOW_CENTER, GLOW_RADIUS, k);
  lit *= sphereShadow(p, rd, PEBBLE_CENTER, PEBBLE_RADIUS, k);
  return lit * blockShadow(p, rd);
}

// Penumbrae from how closely the shadow ray grazes everything on its way out
// (Quilez's improved soft shadow). Softness widens the light's apparent size.
float sunShadow(vec3 p, vec3 n) {
  vec3 toLight = uLightPosition - p;
  float far = length(toLight);
  vec3 rd = toLight / far;
  vec3 ro = p + n * 0.01;
  // The penumbra is k⁻¹ wide per unit of distance.
  float k = 1.0 / max(uShadowSoftness * 0.005, 0.0005);

  if (sdBox(uLightPosition - ROOM_CENTER, SHELL_HALF) > 0.0) {
    // Inside the room, an outdoor sun only gets in through the window, past
    // the spheres and the block — all of which have exact answers, so
    // there's nothing to march.
    if (sdBox(ro - ROOM_CENTER, ROOM_HALF) < 0.0) return airVisibility(ro);

    // Past the building there is nothing left to hit.
    vec2 span = shellSpan(ro, rd);
    if (span.y < 0.05 || span.x > span.y) return 1.0;
    far = min(far, span.y + 0.3);
  }

  float lit = 1.0;
  float t = 0.02;
  for (int i = 0; i < 64; i++) {
    float h = sceneDistance(ro + rd * t);
    lit = min(lit, k * h / t);
    t += clamp(h, 0.015, 1.0);
    if (lit < -1.0 || t > far) break;
  }
  // A ray that crawled along a surface and never got out is taken as blocked.
  if (t < far) return 0.0;
  lit = max(lit, -1.0);
  return 0.25 * (1.0 + lit) * (1.0 + lit) * (2.0 - lit);
}

vec3 sunlight(vec3 p, vec3 n) {
  float facing = dot(n, normalize(uLightPosition - p));
  if (facing <= 0.0) return vec3(0.0);
  return SUN * facing * sunShadow(p, n);
}

/** Light leaving a surface point toward whatever is looking at it, given what else arrives there. */
vec3 radianceAt(vec3 p, vec3 n, vec3 arriving) {
  vec3 albedo, emission;
  surface(materialAt(p), albedo, emission);
  return emission + albedo * (sunlight(p, n) + AMBIENT_TINT * uAmbient + arriving);
}

uvec4 pcg4d(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}

// Four uniform numbers for this pixel and frame: a bounce direction, then
// where the bounce and the air march each start. Blue noise walks each texel
// along its own low-discrepancy sequence (R2 for the direction, golden ratio
// and √2 for the two offsets), so every frame is blue and the frames together
// cover the range evenly; white noise is just a hash.
// The second bounce reads the same texture from a far-off texel, which in
// blue noise is as good as a fresh layer.
vec4 sampleNoise(int layer) {
  if (uSampling == SAMPLING_BLUE) {
    ivec2 texel = (ivec2(gl_FragCoord.xy) + layer * ivec2(23, 41)) & 63;
    vec4 blue = texelFetch(uBlueNoise, texel, 0) + 0.5 / 256.0;
    return fract(blue + uNoiseIndex * vec4(0.7548776662, 0.5698402910, 0.6180339887, 0.4142135624));
  }
  uvec4 hash = pcg4d(uvec4(uvec2(gl_FragCoord.xy), uint(uNoiseIndex), uint(layer)));
  return vec4(hash) * (1.0 / 4294967296.0);
}

// Cosine-weighted, so the plain average of the bounce samples is already the
// diffuse light: no pdf to divide out. Basis from Duff et al. 2017.
vec3 cosineDirection(vec3 n, vec2 u) {
  float s = n.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (s + n.z);
  float b = n.x * n.y * a;
  vec3 tangent = vec3(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
  vec3 bitangent = vec3(b, s + n.y * n.y * a, -n.y);
  float r = sqrt(u.y);
  float phi = 6.28318530718 * u.x;
  return r * cos(phi) * tangent + r * sin(phi) * bitangent + sqrt(max(0.0, 1.0 - u.y)) * n;
}

// The bounce ray strides out in at least BOUNCE_REACH / steps at a time,
// leaping further where the field says the way is clear. Few steps means long
// strides that skip past thin things and land well inside whatever they hit;
// jitter slides every stride by a random fraction, so those misses turn from
// bands into noise that accumulation averages away.
//
// Returns whether it landed on a surface (q, with normal nq); if not, what it
// found instead in `missed`.
bool march(vec3 p, vec3 n, vec3 noise, out vec3 q, out vec3 nq, out vec3 missed) {
  vec3 rd = cosineDirection(n, noise.xy);
  vec3 ro = p + n * 0.02;
  vec2 span = shellSpan(ro, rd);
  q = ro;
  nq = n;
  missed = sky(rd);
  if (span.y < 0.0 || span.x > span.y) return false;

  float stride = BOUNCE_REACH / float(uMarchSteps);
  float t = max(span.x, 0.0) + stride * mix(0.5, noise.z, uMarchJitter);
  float d = 1.0;
  for (int i = 0; i < MAX_MARCH_STEPS; i++) {
    if (i >= uMarchSteps || t > span.y) break;
    q = ro + rd * t;
    d = sceneDistance(q);
    if (d < 0.0) break;
    t += max(d, stride);
  }
  if (d < 0.0) {
    // Inside something: settle back onto its surface.
    nq = normalAt(q);
    q -= nq * d;
    return true;
  }
  // Out of the building, or out of steps with the fill light standing in.
  if (t <= span.y) missed = AMBIENT_TINT * uAmbient;
  return false;
}

// Light arriving at a surface by bouncing off whatever a cosine-weighted ray
// from it lands on. With two bounces, that surface is lit the same way in
// turn — which is what lets a side the sun never touches catch the sunlit
// floor and pass its colour on to the walls. Shaded after both marches,
// never inside them: neighbouring pixels
// land on different steps, and a GPU would run the shading once for every
// step any of them hit on.
vec3 bounce(vec3 p, vec3 n, vec3 first, vec3 second) {
  vec3 q, nq, missed;
  if (!march(p, n, first, q, nq, missed)) return missed;
  vec3 further = vec3(0.0);
  if (uBounces > 1) {
    vec3 q2, nq2, missed2;
    further = march(q, nq, second, q2, nq2, missed2) ? radianceAt(q2, nq2, vec3(0.0)) : missed2;
  }
  return radianceAt(q, nq, further);
}

/** Henyey–Greenstein, scaled so that scattering evenly in all directions is 1. */
float phase(float cosTheta) {
  const float g = FORWARD_SCATTER;
  float d = 1.0 + g * g - 2.0 * g * cosTheta;
  return (1.0 - g * g) / (d * sqrt(d));
}

// Sunlight scattered toward the camera by the room's air, sampled in even
// slices between the camera (or the wall it looks in through) and whatever
// the camera ray hit. Unjittered, every pixel samples the same slices and the
// shafts come out layered; jitter slides the slices per pixel and per frame,
// and accumulation blends the layers smooth.
vec3 airLight(vec3 ro, vec3 rd, float hit, float jitter, out float transmittance) {
  transmittance = 1.0;
  if (uVolumeDensity <= 0.0) return vec3(0.0);
  vec2 span = boxSpan(ro, rd, ROOM_CENTER, ROOM_HALF);
  float start = max(span.x, 0.0);
  float end = min(span.y, hit);
  if (end <= start) return vec3(0.0);

  float slice = (end - start) / float(uVolumeSteps);
  float t = start + slice * mix(0.5, jitter, uMarchJitter);
  float scattered = 0.0;
  for (int i = 0; i < MAX_VOLUME_STEPS; i++) {
    if (i >= uVolumeSteps) break;
    vec3 p = ro + rd * t;
    scattered += airVisibility(p) * phase(dot(rd, normalize(uLightPosition - p)));
    t += slice;
  }
  transmittance = exp(-uVolumeDensity * (end - start));
  return SUN * uVolumeDensity * scattered * slice;
}

/** Nearest hit of a ray on a sphere from outside it; -1 for a miss. */
float sphereHit(vec3 ro, vec3 rd, vec3 centre, float radius) {
  vec3 oc = ro - centre;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + radius * radius;
  if (h < 0.0) return -1.0;
  return -b - sqrt(h);
}

/** Nearest hit on the block from outside it (its 2 cm rounding ignored); -1 for a miss. */
float blockHit(vec3 ro, vec3 rd) {
  vec3 dir = vec3(BLOCK_TURN.x * rd.x - BLOCK_TURN.y * rd.z, rd.y, BLOCK_TURN.y * rd.x + BLOCK_TURN.x * rd.z);
  vec2 span = boxSpan(toBlock(ro), dir, vec3(0.0), BLOCK_HALF + 0.02);
  return span.x <= span.y && span.x > 0.0 ? span.x : -1.0;
}

// From inside the room the scene is simple enough to hit exactly: the room's
// walls, two spheres and a block. Only a ray that leaves through the window
// needs marching, from the opening on.
float castFromRoom(vec3 ro, vec3 rd, out bool throughWindow) {
  float t = boxSpan(ro, rd, ROOM_CENTER, ROOM_HALF).y;
  vec3 exit = ro + rd * t;
  throughWindow = exit.x > INNER_X - 0.001 && windowMiss(exit.yz) < 0.0;
  float nearest = t;
  float glow = sphereHit(ro, rd, GLOW_CENTER, GLOW_RADIUS);
  if (glow > 0.0) nearest = min(nearest, glow);
  float pebble = sphereHit(ro, rd, PEBBLE_CENTER, PEBBLE_RADIUS);
  if (pebble > 0.0) nearest = min(nearest, pebble);
  float block = blockHit(ro, rd);
  if (block > 0.0) nearest = min(nearest, block);
  if (nearest < t) throughWindow = false;
  return nearest;
}

float castCamera(vec3 ro, vec3 rd) {
  float start = 0.0;
  if (sdBox(ro - ROOM_CENTER, ROOM_HALF) < 0.0) {
    bool throughWindow;
    float t = castFromRoom(ro, rd, throughWindow);
    if (!throughWindow) return t;
    start = t;
  }

  vec2 span = shellSpan(ro, rd);
  if (span.y < 0.0 || span.x > span.y) return -1.0;

  float t = max(span.x - 0.01, start);
  if (sceneDistance(ro) < 0.0) {
    // Orbiting through a wall: see straight through it, like a near clip.
    // Walk out of the solid and on until clear of its far face; stopping
    // right on that face would let the march below "hit" the face it just
    // left, in thin contour lines wherever the last step happened to land.
    for (int i = 0; i < 64; i++) {
      float d = sceneDistance(ro + rd * t);
      if (d > 0.01) break;
      t += max(abs(d), 0.05);
    }
  }
  for (int i = 0; i < 100; i++) {
    float d = sceneDistance(ro + rd * t);
    if (d < max(0.0004 * t, 0.0002)) return t;
    t += d;
    if (t > span.y) break;
  }
  return -1.0;
}

/** Where a world point fell in the previous frame's picture, in pixels, and how far it was from that camera. */
vec2 previousPixel(vec3 p, out float range) {
  vec3 v = p - uPreviousPosition;
  range = length(v);
  float z = dot(v, uPreviousForward);
  if (z <= 0.0) return vec2(-1.0);
  vec2 ndc = vec2(dot(v, uPreviousRight), dot(v, uPreviousUp)) / (z * uTanHalfFov);
  ndc.x *= uResolution.y / uResolution.x;
  return (ndc * 0.5 + 0.5) * uResolution;
}

// What this pixel already knows about the bounce light reaching its surface.
// At rest that's simply its own history. On the move, the light reaching a
// point doesn't depend on where it's seen from, so last frame's still holds:
// find where the surface was, check it's the same one and not something
// newly uncovered, and carry it over.
vec4 bounceHistory(vec3 ro, vec3 rd, float t) {
  if (uMode == MODE_REST) return texelFetch(uBounceHistory, ivec2(gl_FragCoord.xy), 0);
  if (uMode != MODE_MOVING || t < 0.0) return vec4(0.0);

  // Bilinear between the four nearest texels, each kept only if it saw this
  // same surface. Nearest-texel would snap a little every frame, and edges
  // carried across many frames would come out in stair steps.
  float range;
  vec2 previous = previousPixel(ro + rd * t, range) - 0.5;
  ivec2 base = ivec2(floor(previous));
  vec2 f = previous - vec2(base);
  vec3 light = vec3(0.0);
  float total = 0.0;
  float count = SETTLED;
  for (int i = 0; i < 4; i++) {
    ivec2 offset = ivec2(i & 1, i >> 1);
    ivec2 texel = base + offset;
    if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, ivec2(uResolution)))) continue;
    float seen = texelFetch(uDirectHistory, texel, 0).a;
    if (abs(seen - range) > 0.02 * range + 0.01) continue;
    vec2 w2 = mix(1.0 - f, f, vec2(offset));
    float w = w2.x * w2.y;
    vec4 history = texelFetch(uBounceHistory, texel, 0);
    light += history.rgb * w;
    total += w;
    count = min(count, history.a);
  }
  // Nothing here saw it: newly uncovered, so it starts again.
  if (total < 0.01) return vec4(0.0);
  return vec4(light / total, count);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy - 0.5 + uJitter) / uResolution * 2.0 - 1.0;
  ndc.x *= uResolution.x / uResolution.y;
  vec3 rd = normalize(uCameraForward + (ndc.x * uCameraRight + ndc.y * uCameraUp) * uTanHalfFov);
  ivec2 pixel = ivec2(gl_FragCoord.xy);

  vec4 noise = sampleNoise(0);
  float t = castCamera(uCameraPosition, rd);
  vec3 direct = sky(rd);
  vec3 albedo = vec3(0.0);
  // The sky has no surface for anything to bounce onto.
  vec4 bounced = vec4(0.0, 0.0, 0.0, 1.0);

  if (t >= 0.0) {
    vec3 p = uCameraPosition + rd * t;
    vec3 n = normalAt(p);
    vec3 emission;
    surface(materialAt(p), albedo, emission);
    direct = emission + albedo * (sunlight(p, n) + AMBIENT_TINT * uAmbient);

    vec4 history = bounceHistory(uCameraPosition, rd, t);
    if (uMode == MODE_MOVING && history.a >= SETTLED) {
      // Settled already: carried over as it is, and costs nothing to trace.
      bounced = history;
    } else {
      vec3 light = bounce(p, n, noise.xyz, sampleNoise(1).xyz);
      // One bad sample would sit in the mean for good.
      if (any(isnan(light)) || any(isinf(light))) light = vec3(0.0);
      float count = history.a + 1.0;
      bounced = vec4(mix(history.rgb, light, 1.0 / count), count);
    }
  }
  if (any(isnan(direct)) || any(isinf(direct))) direct = vec3(0.0);

  float transmittance;
  vec3 air = airLight(uCameraPosition, rd, t >= 0.0 ? t : 1e4, noise.w, transmittance);

  outBounce = bounced;
  outDirect = vec4(mix(texelFetch(uDirectHistory, pixel, 0).rgb, direct, uWeight), t >= 0.0 ? t : -1.0);
  outAlbedo = mix(texelFetch(uAlbedoHistory, pixel, 0), vec4(albedo, 1.0), uWeight);
  outAir = mix(texelFetch(uAirHistory, pixel, 0), vec4(air, transmittance), uWeight);
}
