#ifdef GL_ES
precision highp float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uAngle;
uniform float uTimeScale;
uniform float uStripeDensity;
uniform float uWarpLarge;
uniform float uWarpMedium;
uniform float uWarpFine;
uniform float uEdgeSoftness;
uniform vec3 uGapColor;
uniform vec3 uLineColor;

varying vec2 vUv;

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(in vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
}

void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    float c = cos(uAngle);
    float s = sin(uAngle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

    float t = uTime * uTimeScale;

    float warp = 0.0;
    warp += noise(p * 1.2 + t * 0.12) * uWarpLarge;
    warp += noise(p * 0.1 + t * 0.08 + 50.0) * uWarpMedium;
    warp += noise(p * 700.0 + t * 0.5 + 1.1) * uWarpFine;

    float stripeCoord = (p.y + warp) * uStripeDensity;
    float wave = sin(stripeCoord * 3.14159);

    float edge = uEdgeSoftness;
    float pattern = smoothstep(-edge, -edge * 0.1666667, wave)
        * (1.0 - smoothstep(edge * 0.1666667, edge, wave));

    vec3 col = mix(uGapColor, uLineColor, pattern);

    gl_FragColor = vec4(col, 1.0);
}
