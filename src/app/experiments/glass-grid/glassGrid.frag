#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;
uniform float uAspectRatio;
uniform vec2 uPointer;
// The real cursor is hidden; this one sits in the scene behind the ribs.
uniform vec2 uCursor;        // tip position, uv
uniform float uCursorAlpha;  // fades out when the pointer leaves
uniform vec2 uResolution;    // CSS pixels, so the cursor keeps a cursor's size
varying vec2 vUv;

const float PI = 3.14159265;
/** Height of the cursor, in CSS pixels, on the classic 12 × 19 pointer grid. */
const float CURSOR_HEIGHT = 24.0;
/**
 * How far behind the ribs the cursor sits, as a share of the background's
 * distance. Refraction grows with depth: 0 is pressed against the glass and
 * crisp, 1 is smeared like the scene behind it.
 */
const float CURSOR_DEPTH = 0.3;

float softGlow(float distance, float width) {
    float d = distance / width;
    return exp(-d * d);
}

// A broad, asymmetric light ribbon: honey above, a thin copper edge below.
// Evaluated analytically so the glass needs no blur textures or extra passes.
vec3 amberLight(vec2 uv, float time) {
    vec2 p = uv - 0.5;
    p.x *= uAspectRatio;
    float sweep = sin(p.x * 1.65 + time * 0.19);
    float ribbon = 0.04 + sweep * 0.23;
    ribbon += sin(p.x * 3.1 - time * 0.13 + 0.8) * 0.035;
    ribbon += uPointer.y * 0.065 + uPointer.x * p.x * 0.035;
    float distance = p.y - ribbon;

    float width = 0.19 + 0.04 * sin(p.x * 1.8 + time * 0.21);
    float upperGlow = softGlow(distance, width);
    upperGlow *= smoothstep(-0.035, 0.025, distance);
    float core = softGlow(distance - 0.075, 0.095);
    float copper = softGlow(distance + 0.032, 0.065);
    float haze = exp(-abs(distance) * 5.5);

    vec3 color = mix(vec3(0.010, 0.018, 0.017), vec3(0.055, 0.035, 0.012),
        smoothstep(-0.25, 0.5, p.y));
    color += vec3(0.18, 0.055, 0.008) * haze;
    color += vec3(0.23, 0.042, 0.023) * copper;
    color += vec3(0.76, 0.32, 0.055) * upperGlow;
    color += vec3(0.62, 0.47, 0.29) * core;

    // A second, dim reflection drifts independently behind the main ribbon.
    float reflection = p.y + ribbon * 0.65 + 0.35;
    color += vec3(0.14, 0.065, 0.012) * exp(-reflection * reflection * 32.0);
    return color;
}

// One edge of Inigo Quilez's exact polygon distance, unrolled for the arrow.
void polygonEdge(vec2 p, vec2 a, vec2 b, inout float d, inout float s) {
    vec2 e = b - a;
    vec2 w = p - a;
    vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(q, q));
    bvec3 c = bvec3(p.y >= a.y, p.y < b.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
}

// Signed distance to the classic arrow pointer, tip at the origin, y down,
// on its 12 × 19 grid.
float arrowDistance(vec2 p) {
    vec2 v0 = vec2(0.0, 0.0);
    vec2 v1 = vec2(0.0, 16.0);
    vec2 v2 = vec2(4.0, 12.5);
    vec2 v3 = vec2(7.0, 19.0);
    vec2 v4 = vec2(9.5, 18.0);
    vec2 v5 = vec2(6.7, 11.8);
    vec2 v6 = vec2(12.0, 11.8);
    float d = dot(p - v0, p - v0);
    float s = 1.0;
    polygonEdge(p, v0, v6, d, s);
    polygonEdge(p, v1, v0, d, s);
    polygonEdge(p, v2, v1, d, s);
    polygonEdge(p, v3, v2, d, s);
    polygonEdge(p, v4, v3, d, s);
    polygonEdge(p, v5, v4, d, s);
    polygonEdge(p, v6, v5, d, s);
    return s * sqrt(d);
}

// The cursor as part of the scene the glass refracts: a dark arrow with a
// light rim, so it reads as an object behind the ribs.
vec3 withCursor(vec3 color, vec2 uv) {
    if (uCursorAlpha <= 0.0) return color;
    float scale = CURSOR_HEIGHT / 19.0;
    vec2 offset = (uv - uCursor) * uResolution;
    float distance = arrowDistance(vec2(offset.x, -offset.y) / scale) * scale;
    float fill = 1.0 - smoothstep(-0.6, 0.6, distance);
    float rim = fill * smoothstep(-2.4, -1.2, distance);
    vec3 arrow = mix(vec3(0.02), vec3(0.96, 0.94, 0.9), rim);
    return mix(color, arrow, fill * uCursorAlpha);
}

void main() {
    vec2 uv = vUv;
    float count = clamp(uAspectRatio * 25.0, 12.0, 30.0);
    float flute = uv.x * count;
    float cell = floor(flute);
    float local = fract(flute);
    float roundness = sin(local * PI);
    // Derivatives are taken up front: they are undefined inside divergent branches.
    float aa = max(fwidth(local), 0.001);
    float lightHeight = 0.35 + 0.65 * softGlow(uv.y - 0.6, 0.667);

    // Thick ribbed glass gathers a wider piece of the scene into each flute.
    // Log compression makes the ribbon taper into a sharp point at each seam.
    float lens = log(1.0 + local * 22.0) / log(23.0);
    vec2 refracted = vec2((cell + lens * 1.85 - 0.42) / count, uv.y);
    refracted.y += (1.0 - roundness) * 0.075;
    refracted.y += sin(cell * 0.73 + uTime * 0.17) * 0.009 * roundness;
    vec3 glass = withCursor(amberLight(refracted, uTime), mix(uv, refracted, CURSOR_DEPTH));

    // Dark rolled edges and a fine champagne reflection give each rib depth.
    float body = 0.68 + 0.32 * pow(roundness, 0.55);
    glass *= body;
    float seam = 1.0 - smoothstep(0.0, aa * 1.3, local);
    float glint = softGlow(local - 0.08, 0.035);
    glass += vec3(0.12, 0.10, 0.06) * seam * lightHeight;
    glass += vec3(0.025, 0.016, 0.006) * glint;
    glass *= 1.0 - 0.35 * smoothstep(0.87, 1.0, local);

    // The pane covers the left half and ends on a rib seam; past it the scene
    // and the cursor are seen directly.
    float paneEdge = floor(count * 0.5) / count;
    float past = (uv.x - paneEdge) * uResolution.x; // CSS pixels beyond the edge
    vec3 clear = withCursor(amberLight(uv, uTime), uv);
    clear *= 1.0 - 0.3 * exp(-max(past, 0.0) / 12.0); // the glass's soft shadow
    vec3 color = mix(glass, clear, smoothstep(-0.5, 0.5, past));
    color += vec3(0.16, 0.13, 0.08) * exp(-past * past / 1.5) * lightHeight; // polished edge

    vec2 vignette = (uv - 0.5) * vec2(1.1, 0.8);
    color *= 1.0 - dot(vignette, vignette) * 0.45;
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (grain - 0.5) * 0.006;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
