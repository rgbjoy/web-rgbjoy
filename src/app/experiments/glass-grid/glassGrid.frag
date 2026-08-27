#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: cosinePalettePreset = require('../../utilities/shaders/colorPalettePresets.glsl')

// Fluted glass over soft vertical color wash

uniform vec2 uResolution;
uniform float uTime;
uniform float uAspectRatio;

varying vec2 vUv;

const float TIME_SCALE = 0.7;
const float NUM_SEGMENTS = 10.0;
const float INPUT_OUTPUT_RATIO = 1.85;
const float OVERLAP = 0.72;
const float LOG_RANGE = 39.0;
const float BAND_COUNT = 7.0;
const float LINE_DRIFT = 0.06;
const float WAVE_AMP = 0.005;
const float WAVE_SPATIAL = 8.0;
const float WAVE_SPEED = 0.5;
const float PALETTE_PRESET = 1.0; // cool-drift
const float FRAME_HALF_Y = 0.62;
const float FRAME_BLEED = 0.06;
const float FRAME_FEATHER = 0.012;
const vec3 FRAME_BG = vec3(0.0);

vec3 sampleWash(vec2 refractUV, float time) {
    vec2 p = refractUV - 0.5;
    p.x *= uAspectRatio;
    p.x -= time * LINE_DRIFT;

    // Soft vertical curtains — compress cleanly through log flutes
    float curtains = 0.5 + 0.5 * sin(p.x * BAND_COUNT + time * 0.12);
    curtains = mix(
        curtains,
        0.5 + 0.5 * sin(p.x * BAND_COUNT * 1.65 - time * 0.07 + 1.1),
        0.4
    );

    // Thin bright ridges so flute edges stay readable
    float ridge = 0.5 + 0.5 * sin(p.x * BAND_COUNT * 3.14159265);
    ridge = pow(ridge, 10.0);

    // Soft sky falloff + horizon bloom
    float sky = smoothstep(-0.6, 0.45, p.y);
    float glow = exp(-abs(p.y + 0.02) * 2.1) * 0.4;

    float drift = p.x * 0.07 - time * 0.035;
    float t = curtains * 0.42 + sky * 0.38 + glow + drift;

    vec3 col = cosinePalettePreset(t, PALETTE_PRESET);
    col += vec3(0.18, 0.2, 0.22) * ridge * 0.28;

    // Gentle vignette so the panel feels lit from center
    float vig = 1.0 - dot(p * 0.7, p * 0.7);
    vig = clamp(pow(vig, 1.1), 0.0, 1.0);
    col *= 0.92 + 0.1 * vig;

    return col;
}

vec3 sampleFluted(vec2 uv, float time) {
    float segmentWidth = 1.0 / NUM_SEGMENTS;
    float inputSegmentWidth = segmentWidth * INPUT_OUTPUT_RATIO;
    float overlapWidth = segmentWidth * OVERLAP;

    float segmentIndex = floor(uv.x / segmentWidth);
    float segmentStart = segmentIndex * segmentWidth;
    float localUVx = (uv.x - segmentStart) / segmentWidth;

    float compressedX = log(1.0 + localUVx * LOG_RANGE) / log(1.0 + LOG_RANGE);

    float inputSegmentStart = segmentIndex * (inputSegmentWidth - overlapWidth);
    vec2 inputUV = vec2(inputSegmentStart + compressedX * inputSegmentWidth, uv.y);

    return sampleWash(inputUV, time);
}

vec2 wavyUV(vec2 uv, float time) {
    float wave = sin(uv.y * WAVE_SPATIAL + time * WAVE_SPEED);
    wave += 0.45 * sin(uv.y * WAVE_SPATIAL * 1.7 - time * WAVE_SPEED * 0.65);
    return vec2(uv.x + wave * WAVE_AMP, uv.y);
}

void main() {
    vec2 uv = vUv;
    float time = uTime * TIME_SCALE;

    vec3 col = sampleFluted(wavyUV(uv, time), time);

    vec2 frameP = uv - 0.5;
    frameP.x *= uAspectRatio;
    float frameHalfX = uAspectRatio * 0.5 + FRAME_BLEED;
    float frameMask = smoothstep(0.0, FRAME_FEATHER, frameHalfX - abs(frameP.x))
        * smoothstep(0.0, FRAME_FEATHER, FRAME_HALF_Y + FRAME_BLEED * 0.5 - abs(frameP.y));
    col = mix(FRAME_BG, col, frameMask);

    gl_FragColor = vec4(col, 1.0);
}
