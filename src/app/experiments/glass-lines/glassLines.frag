#ifdef GL_ES
precision highp float;
#endif

// by SamuelYAN
// https://twitter.com/SamuelAnn0924
// https://www.instagram.com/samuel_yan_1990/

uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUv;

const float TILT = 1.57079632679; // 90 degrees
const float TIME_SCALE = 0.7;
const float SWEEP_AMP = 1.0;
const float SWEEP_SPATIAL = 1.5;
const float SWEEP_SPEED = 1.2;
const float DISTORT = 1.05;
const float LINE_WAVE = 0.7;
const float REFRACT_SCALE = 0.45;
const float CHROMA_SHIFT = 1.35;
const float FRAME_HALF_Y = 0.62;
const float FRAME_BLEED = 0.06;
const float FRAME_FEATHER = 0.012;
const vec3 FRAME_BG = vec3(0.0);

vec2 rot2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec2 cdiv(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(
        (a.x * b.x + a.y * b.y) / d,
        (a.y * b.x - a.x * b.y) / d
    );
}

vec3 palette(float t) {
    return vec3(
        0.5 + 0.5 * cos(t),
        0.5 + 0.5 * cos(t + 2.0),
        0.5 + 0.5 * cos(t + 4.0)
    );
}

void main() {
    vec2 uv = vUv;
    vec2 s = (uv - 0.5) * 2.0;
    s.x *= uResolution.x / uResolution.y;

    float time = uTime * TIME_SCALE;

    float zoom = 1.0 + 0.05 * sin(time * 0.35);
    s *= zoom;
    s = rot2(s, TILT);

    float lineCount = 16.0 + 0.0 * sin(time * 0.3);
    float spacing = 0.1;
    float sz = 1.0;
    float strength = 2.5;

    float phi = 0.5;

    for (float i = 0.0; i < 32.0; i++) {
        if (i >= floor(lineCount)) break;

        float xoff = (i - (lineCount - 1.0) * 0.5) * spacing;

        vec2 a = vec2(s.x - xoff, s.y - sz);
        vec2 b = vec2(s.x - xoff, s.y + sz);

        vec2 q = cdiv(a, b);

        phi += strength * atan(q.y, q.x) + LINE_WAVE * sin(time + i * 1.2);
    }

    phi /= lineCount;

    phi += SWEEP_AMP * sin(s.x * SWEEP_SPATIAL + time * SWEEP_SPEED);

    float distort = phi * DISTORT;

    vec2 refractUV = uv + vec2(distort * REFRACT_SCALE, 0.0);

    vec3 col;
    col.r = palette(refractUV.x + CHROMA_SHIFT).r;
    col.g = palette(refractUV.x).g;
    col.b = palette(refractUV.x - CHROMA_SHIFT).b;

    col *= 1.1 + 0.07 * sin(time * 0.8);

    col = col / (col + vec3(0.4));
    col = pow(col, vec3(0.97));
    col *= 1.15;

    vec2 frameP = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    frameP.x *= aspect;
    float frameHalfX = aspect * 0.5 + FRAME_BLEED;
    float frameMask = smoothstep(0.0, FRAME_FEATHER, frameHalfX - abs(frameP.x))
        * smoothstep(0.0, FRAME_FEATHER, FRAME_HALF_Y + FRAME_BLEED * 0.5 - abs(frameP.y));
    col = mix(FRAME_BG, col, frameMask);

    gl_FragColor = vec4(col, 1.0);
}
