// One frame of the building, as a compute shader: a camera ray, the sun, a
// bounce path of one or two hops per pixel and a march through the sunlit
// air, each blended into the running mean of every frame before it, and
// written to four storage textures per invocation.
//
// The bounce is kept apart from the rest. It is the noisy, costly part, and
// it is smooth: when the camera moves it is carried over from last frame and
// only traced where something new comes into view. Everything sharp — the
// sun, its shadows, the surfaces' colours — is cheap, so it is simply traced
// again, and stays crisp however far the camera swings.
//
// With the probe volume, the bounce isn't traced per pixel at all: it's read
// from the probes around each surface, which probe.wgsl keeps up to date.
//
// The chrome torus bounces nothing matte; it mirrors. What it shows depends on
// where it's seen from, so it all goes with the sharp, cheap part — traced
// fresh each frame — and none of it with the bounce carried across moves.
//
// While the plus turns, its shadow and its bounce move. The bounce near it
// then keeps only a short running mean, carried over by where each point was
// — on the plus, where it was before it turned — and the denoiser after this
// pass smooths what that leaves noisy (paths.wgsl's memory()).
//
// Pixels run bottom-up, as gl_FragCoord did, so all the screen maths carries
// over unchanged; the display pass turns the picture the right way up.

// Frame comes from frame.wgsl, the bounce rays from paths.wgsl, joined ahead of this.

@group(1) @binding(0) var<uniform> frame: Frame;
@group(1) @binding(1) var blueNoise: texture_2d<f32>;
// Last frame's means.
@group(1) @binding(2) var bounceHistory: texture_2d<f32>;
@group(1) @binding(3) var directHistory: texture_2d<f32>;
@group(1) @binding(4) var albedoHistory: texture_2d<f32>;
@group(1) @binding(5) var airHistory: texture_2d<f32>;
/** Light arriving by bouncing off other surfaces (rgb), and how many samples that mean holds (a). */
@group(1) @binding(6) var bounceOut: texture_storage_2d<rgba32float, write>;
/** Light leaving the surface by every other way (rgb), and the distance to it (a; -1 for sky). */
@group(1) @binding(7) var directOut: texture_storage_2d<rgba32float, write>;
/** The surface's colour, averaged over the pixel (rgb), and this frame's normal there and whether it's the mirror, packed (a). */
@group(1) @binding(8) var albedoOut: texture_storage_2d<rgba32float, write>;
/** Sunlight the air scatters toward the camera (rgb), and how much of the surface gets through (a). */
@group(1) @binding(9) var airOut: texture_storage_2d<rgba32float, write>;
/** Last frame's bounce, denoised, when frame.smoothHistory says it's of this history. For the chrome to show. */
@group(1) @binding(10) var bounceSmooth: texture_2d<f32>;

const MAX_VOLUME_STEPS = 64u;
/** Henyey–Greenstein asymmetry: the air scatters a little forward, so the
 *  shafts brighten as you look toward the window. */
const FORWARD_SCATTER = 0.35;
/** How tight the sun's glint on the chrome is (a Phong exponent). A true
 *  mirror would show the sun as a speck smaller than a pixel; a little
 *  polish spreads it wide enough to catch. */
const GLINT = 900.0;

/** Henyey–Greenstein, scaled so that scattering evenly in all directions is 1. */
fn phase(cosTheta: f32) -> f32 {
  let g = FORWARD_SCATTER;
  let d = 1.0 + g * g - 2.0 * g * cosTheta;
  return (1.0 - g * g) / (d * sqrt(d));
}

struct Air {
  light: vec3f,
  transmittance: f32,
}

// Sunlight scattered toward the camera by the room's air, sampled in even
// slices between the camera (or the wall it looks in through) and whatever
// the camera ray hit. Unjittered, every pixel samples the same slices and the
// shafts come out layered; jitter slides the slices per pixel and per frame,
// and accumulation blends the layers smooth.
fn airLight(ro: vec3f, rd: vec3f, hit: f32, jitter: f32) -> Air {
  if (frame.volumeDensity <= 0.0) { return Air(vec3f(0.0), 1.0); }
  let span = boxSpan(ro, rd, ROOM_CENTER, ROOM_HALF);
  let start = max(span.x, 0.0);
  let stop = min(span.y, hit);
  if (stop <= start) { return Air(vec3f(0.0), 1.0); }

  let steps = min(frame.volumeSteps, MAX_VOLUME_STEPS);
  let slice = (stop - start) / f32(steps);
  var t = start + slice * mix(0.5, jitter, frame.marchJitter);
  var scattered = 0.0;
  for (var i = 0u; i < steps; i++) {
    let p = ro + rd * t;
    scattered += airVisibility(p) * phase(dot(rd, normalize(scene.lightPosition - p)));
    t += slice;
  }
  let transmittance = exp(-frame.volumeDensity * (stop - start));
  return Air(SUN * frame.volumeDensity * scattered * slice, transmittance);
}

// The bounce light last frame gathered for a surface point, wherever on
// screen it was. The light reaching a point doesn't depend on where it's seen
// from, so it still holds: find where the point was, check that pixel saw
// this same surface and not something in front of it, and carry it over.
// Nothing (a = 0) if last frame didn't see it. Denoised, it's read from the
// denoised picture — for showing, never for building the mean on.
fn carriedBounce(p: vec3f, denoised: bool) -> vec4f {
  // Bilinear between the four nearest texels, each kept only if it saw this
  // same surface. Nearest-texel would snap a little every frame, and edges
  // carried across many frames would come out in stair steps.
  let found = previousPixel(wasAt(p));
  let range = found.z;
  let previous = found.xy - 0.5;
  let base = vec2i(floor(previous));
  let f = previous - vec2f(base);
  let size = vec2i(frame.resolution);
  var light = vec3f(0.0);
  var total = 0.0;
  var count = SETTLED;
  for (var i = 0; i < 4; i++) {
    let offset = vec2i(i & 1, i >> 1u);
    let texel = base + offset;
    if (any(texel < vec2i(0)) || any(texel >= size)) { continue; }
    let seen = textureLoad(directHistory, texel, 0).a;
    if (abs(seen - range) > 0.02 * range + 0.01) { continue; }
    let w2 = mix(1.0 - f, f, vec2f(offset));
    let w = w2.x * w2.y;
    let history = textureLoad(bounceHistory, texel, 0);
    var seenLight = history.rgb;
    if (denoised) { seenLight = textureLoad(bounceSmooth, texel, 0).rgb; }
    light += seenLight * w;
    total += w;
    count = min(count, history.a);
  }
  if (total < 0.01) { return vec4f(0.0); }
  return vec4f(light / total, count);
}

// What this pixel already knows about the bounce light reaching its surface.
// At rest that's simply its own history. On the move it's carried over from
// wherever last frame saw the surface; where nothing did, it's newly
// uncovered and starts again.
fn bounceHistoryAt(pixel: vec2i, ro: vec3f, rd: vec3f, t: f32) -> vec4f {
  if (frame.mode == MODE_REST) { return textureLoad(bounceHistory, pixel, 0); }
  if (frame.mode != MODE_MOVING || t < 0.0) { return vec4f(0.0); }
  return carriedBounce(ro + rd * t, false);
}

// The bounce light reaching a surface seen in the chrome. A mirror shows
// every speck of noise in what it reflects, sharp and unblurred, so it's
// given the smoothest light there is. The path tracer has it for what's on
// screen, denoised where the denoiser has run; for the rest — behind the
// camera, or hidden from it — the probe volume, which keeps itself up to date
// even while the path tracer is the method, stands in. Only before the probes
// hold anything does a reflection fall back to one fresh, noisy bounce.
fn mirroredBounce(pixel: vec2i, q: vec3f, nq: vec3f) -> vec3f {
  if (frame.method == METHOD_PROBES) { return probeLight(q, nq) * occlusion(q, nq); }
  if (frame.mode != MODE_FRESH) {
    let carried = carriedBounce(q, frame.smoothHistory == 1u);
    if (carried.a > 0.0) { return carried.rgb; }
  }
  if (frame.probesReady == 1u) { return probeLight(q, nq) * occlusion(q, nq); }
  let light = bounce(q, nq, sampleNoise(pixel, 2).xyz, sampleNoise(pixel, 3).xyz);
  return select(vec3f(0.0), light, finite(light));
}

/** The sun's glint: a tight lobe around the mirror direction, shadowed like any sunlight. */
fn glint(p: vec3f, n: vec3f, r: vec3f) -> vec3f {
  let l = normalize(scene.lightPosition - p);
  let lobe = (GLINT + 2.0) / TAU * pow(max(dot(r, l), 0.0), GLINT);
  let facing = dot(n, l);
  if (lobe < 1e-3 || facing <= 0.0) { return vec3f(0.0); }
  return SUN * lobe * facing * sunShadow(p, n);
}

// Chrome: the room in mirror image, through a Fresnel term that turns
// everything to a full mirror at a glancing angle, and through the same sunlit
// air the camera looks through — without it, a mirror hung in the shaft
// shows a room clearer than the one around it. One reflection deep: where
// the torus mirrors itself, its matte stand-in shows instead.
fn chrome(pixel: vec2i, p: vec3f, n: vec3f, rd: vec3f, jitter: f32) -> vec3f {
  let r = reflect(rd, n);
  let fresnel = CHROME + (1.0 - CHROME) * pow(1.0 - max(dot(n, r), 0.0), 5.0);
  let ro = p + n * 0.02;
  let t = castCamera(ro, r);
  var seen = sky(r);
  if (t >= 0.0) {
    let q = ro + r * t;
    let nq = normalAt(q);
    seen = radianceAt(q, nq, mirroredBounce(pixel, q, nq));
  }
  let air = airLight(ro, r, select(1e4, t, t >= 0.0), jitter);
  return fresnel * (seen * air.transmittance + air.light + glint(p, n, r));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= vec2u(frame.resolution))) { return; }
  let pixel = vec2i(id.xy);

  let rd = cameraRay(vec2f(id.xy) + frame.jitter);

  let noise = sampleNoise(pixel, 0);
  let t = castCamera(frame.cameraPosition, rd);
  var direct = sky(rd);
  var albedo = vec3f(0.0);
  var normal = vec3f(0.0, 0.0, 1.0);
  var mirror = false;
  // The sky has no surface for anything to bounce onto.
  var bounced = vec4f(0.0, 0.0, 0.0, 1.0);

  if (t >= 0.0) {
    let p = frame.cameraPosition + rd * t;
    let n = normalAt(p);
    normal = n;
    let material = materialAt(p);
    let s = surface(material, p);
    albedo = s.albedo;
    direct = s.emission + albedo * (sunlight(p, n) + AMBIENT_TINT * scene.ambient);

    if (material == MAT_CHROME) {
      // All mirror and no matte: nothing for the bounce light to land on.
      // The pixel's bounce mean is left as it was, so where the torus's edge
      // shares a pixel with the wall behind, the wall's mean keeps building.
      direct = chrome(pixel, p, n, rd, noise.w);
      albedo = vec3f(0.0);
      mirror = true;
      if (frame.method == METHOD_PROBES) {
        bounced = vec4f(textureLoad(bounceHistory, pixel, 0).rgb, 1.0);
      } else {
        bounced = bounceHistoryAt(pixel, frame.cameraPosition, rd, t);
      }
    } else if (frame.method == METHOD_PROBES) {
      // Noiseless, and the same from any viewpoint: nothing to carry over,
      // only the antialiasing to average while the camera rests. A pixel
      // still follows the probes quickly while they settle.
      let light = probeLight(p, n) * occlusion(p, n);
      let weight = select(1.0, max(frame.weight, frame.probeSettling), frame.mode == MODE_REST);
      bounced = vec4f(mix(textureLoad(bounceHistory, pixel, 0).rgb, light, weight), 1.0);
    } else {
      let history = bounceHistoryAt(pixel, frame.cameraPosition, rd, t);
      let remembered = memory(p);
      if (frame.mode == MODE_MOVING && history.a >= SETTLED && remembered.coast) {
        // Settled already: carried over as it is, and costs nothing to trace.
        bounced = history;
      } else {
        var light = bounce(p, n, noise.xyz, sampleNoise(pixel, 1).xyz);
        // One bad sample would sit in the mean for good.
        if (!finite(light)) { light = vec3f(0.0); }
        let count = min(history.a + 1.0, remembered.samples);
        bounced = vec4f(mix(history.rgb, light, 1.0 / count), count);
      }
    }
  }
  if (!finite(direct)) { direct = vec3f(0.0); }

  let air = airLight(frame.cameraPosition, rd, select(1e4, t, t >= 0.0), noise.w);

  textureStore(bounceOut, pixel, bounced);
  // The chrome, like the air, is the same from a camera that holds still, so
  // while the plus turns it keeps the air's short memory to settle its noise.
  let directWeight = select(frame.weight, frame.airWeight, mirror);
  textureStore(directOut, pixel, vec4f(mix(textureLoad(directHistory, pixel, 0).rgb, direct, directWeight), select(-1.0, t, t >= 0.0)));
  textureStore(albedoOut, pixel, vec4f(mix(textureLoad(albedoHistory, pixel, 0).rgb, albedo, frame.weight), packSurface(normal, mirror)));
  textureStore(airOut, pixel, mix(textureLoad(airHistory, pixel, 0), vec4f(air.light, air.transmittance), frame.airWeight));
}
