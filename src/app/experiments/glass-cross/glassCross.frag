#ifdef GL_ES
precision highp float;
#endif

// Cross glass — vertical line over black wavy lines on white

uniform vec2 uResolution;
uniform float uTime;
uniform float uAspectRatio;

varying vec2 vUv;

const float GLASS_STRENGTH = 0.2;
const float TILT_V = 1.57079632679; // vertical line
const float TIME_SCALE = 0.7;
const float DISTORT = 1.05;
const float REFRACT_SCALE = 0.45;
const float LINE_SZ = 0.5;
const float LINE_STRENGTH = 2.5;
const float WAVE_DENSITY = 40.0;
const float WAVE_AMP = 0.07;
const float WAVE_SPEED = 0.4;
const float LINE_WIDTH = 0.97;
const vec3 LINE_COLOR = vec3(0.0);
const vec3 BG_WHITE = vec3(1.0);
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

vec3 sampleLineWave(vec2 refractUV, float time) {
    vec2 p = refractUV - 0.5;
    p.x *= uAspectRatio;

    float ripple = sin(p.x * 3.2 + time * WAVE_SPEED) * WAVE_AMP;
    ripple += sin(p.x * 1.4 - time * 0.25 + 1.2) * WAVE_AMP * 0.45;
    float coord = (p.y + ripple) * WAVE_DENSITY + time * 0.15;
    float wave = sin(coord * 3.14159265);
    float aa = fwidth(coord) * 0.5;
    float line = 1.0 - smoothstep(LINE_WIDTH - aa, LINE_WIDTH + aa, abs(wave));

    return mix(BG_WHITE, LINE_COLOR, line);
}

vec2 glassLineRefraction(vec2 s, float tilt) {
    vec2 r = rot2(s, tilt);

    vec2 a = vec2(r.x - LINE_SZ, r.y);
    vec2 b = vec2(r.x + LINE_SZ, r.y);
    vec2 q = cdiv(a, b);

    float phi = 0.5 + LINE_STRENGTH * atan(q.y, q.x);
    float distort = phi * DISTORT;
    float refractAngle = tilt + 1.57079632679;

    return distort * REFRACT_SCALE * vec2(cos(refractAngle), sin(refractAngle));
}

void main() {
    vec2 uv = vUv;
    vec2 s = (uv - 0.5) * 2.0;
    s.x *= uResolution.x / uResolution.y;

    float time = uTime * TIME_SCALE;

    vec2 refractUV = uv + GLASS_STRENGTH * glassLineRefraction(s, TILT_V);

    vec3 col = sampleLineWave(refractUV, time);

    vec2 frameP = uv - 0.5;
    frameP.x *= uAspectRatio;
    float frameHalfX = uAspectRatio * 0.5 + FRAME_BLEED;
    float frameMask = smoothstep(0.0, FRAME_FEATHER, frameHalfX - abs(frameP.x))
        * smoothstep(0.0, FRAME_FEATHER, FRAME_HALF_Y + FRAME_BLEED * 0.5 - abs(frameP.y));
    col = mix(FRAME_BG, col, frameMask);

    gl_FragColor = vec4(col, 1.0);
}
