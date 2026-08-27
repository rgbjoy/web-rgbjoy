#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: noise = require('glsl-noise/simplex/3d')
#pragma glslify: cosinePalettePreset = require('../../utilities/shaders/colorPalettePresets.glsl')

// Straight vertical glass line-field + shared cosine palette (gold)

uniform vec2 uResolution;
uniform float uTime;
uniform float uAspectRatio;

varying vec2 vUv;

const float TILT = 1.57079632679; // 90 degrees — vertical lines
const float PALETTE_PRESET = 3.0; // gold — see src/app/utilities/shaders/colorPalettePresets.glsl
const float TIME_SCALE = 0.7;
const float GRADIENT_TIME = 0.1;
const float SWEEP_AMP = 1.0;
const float SWEEP_SPATIAL = 1.5;
const float SWEEP_SPEED = 1.2;
const float DISTORT = 1.05;
const float LINE_WAVE = 0.7;
const float REFRACT_SCALE = 0.45;
const float GRADIENT_DISTORT_ITER = 6.0;
const float GRADIENT_DISTORT_INTENSITY = 0.28;
const float GRADIENT_SCALE = 0.72;
const float GRADIENT_SMOOTH = 0.018;
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

vec3 sampleGradient(vec2 refractUV, float gradientTime) {
    float coverScale = max(uAspectRatio / 3.0, 1.0 / 2.0);
    vec2 uv;
    uv.x = 0.5 + (refractUV.x * uAspectRatio - uAspectRatio * 0.5) / (3.0 * coverScale);
    uv.y = 0.5 + (refractUV.y - 0.5) / (2.0 * coverScale);
    uv *= GRADIENT_SCALE;

    for (float i = 0.0; i < GRADIENT_DISTORT_ITER; i++) {
        uv += noise(vec3(uv - i * 0.2, gradientTime + i * 32.0)) * GRADIENT_DISTORT_INTENSITY;
    }

    float t = sin(gradientTime);
    float n0 = noise(vec3(uv, t));
    float n1 = noise(vec3(uv + vec2(GRADIENT_SMOOTH, 0.0), t));
    float n2 = noise(vec3(uv + vec2(0.0, GRADIENT_SMOOTH), t));
    float n3 = noise(vec3(uv + vec2(-GRADIENT_SMOOTH, GRADIENT_SMOOTH * 0.5), t));
    float colourInput = (n0 + n1 + n2 + n3) * 0.125 + 0.5;
    colourInput = smoothstep(0.08, 0.92, colourInput);

    return cosinePalettePreset(colourInput, PALETTE_PRESET);
}

void main() {
    vec2 uv = vUv;
    vec2 s = (uv - 0.5) * 2.0;
    s.x *= uResolution.x / uResolution.y;

    float time = uTime * TIME_SCALE;
    float gradientTime = uTime * GRADIENT_TIME;

    float zoom = 1.0 + 0.05 * sin(time * 0.35);
    s *= zoom;
    s = rot2(s, TILT); // 90° — horizontal line math in rotated space → vertical on screen

    float lineCount = 16.0;
    float spacing = 0.4;
    float sz = 1.0;
    float strength = 2.5;

    float phi = 0.5;

    for (float i = 0.0; i < 32.0; i++) {
        if (i >= floor(lineCount)) break;

        float yoff = (i - (lineCount - 1.0) * 0.5) * spacing;

        vec2 a = vec2(s.x - sz, s.y - yoff);
        vec2 b = vec2(s.x + sz, s.y - yoff);

        vec2 q = cdiv(a, b);

        phi += strength * atan(q.y, q.x) + LINE_WAVE * sin(time + i * 1.2);
    }

    phi /= lineCount;
    phi += SWEEP_AMP * sin(s.y * SWEEP_SPATIAL + time * SWEEP_SPEED);

    float distort = phi * DISTORT;
    vec2 refractUV = uv + vec2(distort * REFRACT_SCALE, 0.0);

    vec3 col = sampleGradient(refractUV, gradientTime);

    vec2 frameP = uv - 0.5;
    frameP.x *= uAspectRatio;
    float frameHalfX = uAspectRatio * 0.5 + FRAME_BLEED;
    float frameMask = smoothstep(0.0, FRAME_FEATHER, frameHalfX - abs(frameP.x))
        * smoothstep(0.0, FRAME_FEATHER, FRAME_HALF_Y + FRAME_BLEED * 0.5 - abs(frameP.y));
    col = mix(FRAME_BG, col, frameMask);

    gl_FragColor = vec4(col, 1.0);
}
