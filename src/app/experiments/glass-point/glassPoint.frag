#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: cosinePalettePreset = require('../../utilities/shaders/colorPalettePresets.glsl')

// 5×3 grid of point lenses refracting an Unbreaking Waves-style wash background

uniform vec2 uResolution;
uniform float uTime;
uniform float uAspectRatio;

varying vec2 vUv;

const float GLASS_STRENGTH = 1.0;
const float TIME_SCALE = 0.7;
const float POINT_SOFT = 0.045;
const float LENS_POWER = 0.55;
const float FIELD_GAIN = 0.065;
const float FIELD_FALLOFF = 0.85;
const float MAX_WARP = 0.22;
const float GRID_COLS = 5.0;
const float GRID_ROWS = 3.0;
const float GRID_MARGIN = 0.9;
const float PALETTE_PRESET = 4.0; // sunset — see src/app/utilities/shaders/colorPalettePresets.glsl
const float PALETTE_SCROLL_SPEED = 0.22;
const float FOG_MIX = 0.06;
const float FRAME_HALF_Y = 0.62;
const float FRAME_BLEED = 0.06;
const float FRAME_FEATHER = 0.012;
const vec3 FRAME_BG = vec3(0.0);

vec3 sampleUnbreakingWash(vec2 uv, float time) {
    vec3 bgColor = cosinePalettePreset(0.08, PALETTE_PRESET);

    vec2 p = uv - 0.5;
    p.x *= uAspectRatio;

    vec2 flowDir = vec2(0.0, 1.0);
    vec2 acrossDir = vec2(-flowDir.y, flowDir.x);
    float along = dot(p, flowDir);
    float across = dot(p, acrossDir);

    float baseWash = 0.0;
    baseWash += 0.5 + 0.5 * sin(along * 2.0 + time * 0.40);
    baseWash += 0.5 + 0.5 * cos(across * 2.6 - time * 0.35);
    baseWash += 0.5 + 0.5 * sin((along + across) * 1.8 + time * 0.25);
    baseWash /= 3.0;

    float flow = smoothstep(0.10, 0.88, baseWash);

    float paletteScroll = dot(p, flowDir) - time * PALETTE_SCROLL_SPEED;

    float wave1 = sin(along * 4.0 + across * 2.2 - time * 0.9);
    float wave2 = cos(across * 5.5 - along * 1.8 + time * 0.7);
    float wave3 = sin(length(p) * 8.0 - time * 1.1);
    float waveMix = 0.5 + 0.5 * (0.45 * wave1 + 0.35 * wave2 + 0.20 * wave3);
    float waveOffset = mix(-0.18, 0.18, waveMix);

    vec3 basePalette = cosinePalettePreset(paletteScroll + waveOffset, PALETTE_PRESET);
    vec3 fogPalette = cosinePalettePreset(paletteScroll + waveOffset - 0.22, PALETTE_PRESET);

    vec3 color = mix(bgColor, basePalette, flow);

    vec3 fogColor = mix(fogPalette, bgColor, 0.45);
    color = mix(color, fogColor, FOG_MIX);

    float vignette = 1.0 - dot(p * 0.85, p * 0.85);
    vignette = clamp(vignette, 0.0, 1.0);
    vignette = pow(vignette, 1.08);
    color *= 0.99 + 0.04 * vignette;

    return color;
}

vec2 pointLensOffsetAt(vec2 s, vec2 point, float time, float phase) {
    vec2 d = s - point;
    float r2 = dot(d, d);
    float r = sqrt(r2);
    vec2 dir = d / max(r, 1e-5);

    float pulse = 1.0 + 0.1 * sin(time * 1.1 + phase);
    float soft2 = POINT_SOFT * POINT_SOFT;
    float mag = pulse * LENS_POWER * FIELD_GAIN / (r2 + soft2);
    mag = MAX_WARP * tanh(mag / MAX_WARP);
    mag *= exp(-r * FIELD_FALLOFF);

    return dir * mag;
}

float pointInfluence(float r) {
    float soft2 = POINT_SOFT * POINT_SOFT;
    return 1.0 / (r * r + soft2);
}

vec2 gridPointAt(float col, float row) {
    float spanX = (uAspectRatio * 0.5 + FRAME_BLEED * 0.5) * GRID_MARGIN * 2.0;
    float spanY = (FRAME_HALF_Y + FRAME_BLEED * 0.25) * GRID_MARGIN * 2.0;
    float u = col / (GRID_COLS - 1.0);
    float v = row / (GRID_ROWS - 1.0);
    return vec2((u - 0.5) * spanX, (v - 0.5) * spanY);
}

vec2 blendGridLens(vec2 s, float time) {
    vec2 lensOff = vec2(0.0);
    float wSum = 0.0;
    float phase = 0.0;

    for (float row = 0.0; row < GRID_ROWS; row++) {
        for (float col = 0.0; col < GRID_COLS; col++) {
            vec2 pt = gridPointAt(col, row);
            float r = length(s - pt);
            float w = pointInfluence(r);
            lensOff += pointLensOffsetAt(s, pt, time, phase) * w;
            wSum += w;
            phase += 1.7;
        }
    }

    return lensOff / max(wSum, 1e-5);
}

void main() {
    vec2 uv = vUv;
    vec2 s = (uv - 0.5) * 2.0;
    s.x *= uAspectRatio;

    float time = uTime * TIME_SCALE;
    vec2 lensOff = blendGridLens(s, time);

    vec2 uvScale = GLASS_STRENGTH * vec2(0.5 / uAspectRatio, 0.5);
    vec3 col = sampleUnbreakingWash(uv + lensOff * uvScale, time);

    vec2 frameP = uv - 0.5;
    frameP.x *= uAspectRatio;
    float frameHalfX = uAspectRatio * 0.5 + FRAME_BLEED;
    float frameMask = smoothstep(0.0, FRAME_FEATHER, frameHalfX - abs(frameP.x))
        * smoothstep(0.0, FRAME_FEATHER, FRAME_HALF_Y + FRAME_BLEED * 0.5 - abs(frameP.y));
    col = mix(FRAME_BG, col, frameMask);

    gl_FragColor = vec4(col, 1.0);
}
