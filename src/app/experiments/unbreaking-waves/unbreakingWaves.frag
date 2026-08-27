#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: cosinePalettePreset = require('../../utilities/shaders/colorPalettePresets.glsl')

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uFogMix;
uniform float uEdgeSoftness;
uniform float uBaseWashStrength;
uniform float uFlowToFull;
uniform float uSpin;
uniform float uPetalK;
uniform float uBaseR;
uniform float uPetalAmp;
uniform vec2 uOrbitCenter;
uniform vec2 uPetalSize;
uniform float uPaletteScrollSpeed;
uniform float uDirection;

varying vec2 vUv;

const float PALETTE_PRESET = 1.0;

void addBlob(
  float fi,
  float t,
  float speed,
  float spin,
  float direction,
  float petalK,
  float baseR,
  float petalAmp,
  float edgeSoftness,
  float petalSizeX,
  float petalSizeY,
  vec2 q,
  inout float flow,
  inout float ringMask,
  inout float centerZoneMask
) {
  float baseAngle = fi / 5.0 * 6.28318530718;
  float theta = baseAngle + t * spin + direction;

  float r = baseR + petalAmp * cos(petalK * theta + fi * 0.6);
  r += 0.035 * sin(t * (1.1 + fi * 0.09) + fi * 1.7);

  vec2 c = vec2(cos(theta), sin(theta)) * r;

  vec2 tangent = vec2(-sin(theta), cos(theta));
  c += tangent * (0.035 * sin(t * 1.7 + fi * 2.1));

  vec2 local = q - c;
  vec2 petalSpace = vec2(local.x / petalSizeX, local.y / petalSizeY);
  float d = dot(petalSpace, petalSpace);

  float outerR = 0.62;
  float midR = 0.38 + 0.02 * cos(t * 1.1 + fi * 1.8);

  float outerBlob = 1.0 - smoothstep(
    (outerR - edgeSoftness) * (outerR - edgeSoftness),
    (outerR + edgeSoftness) * (outerR + edgeSoftness),
    d
  );
  float midBlob = 1.0 - smoothstep(midR - edgeSoftness, midR + edgeSoftness, d);

  float ringOuter = 1.0 - smoothstep(0.34 - edgeSoftness, 0.34 + edgeSoftness, d);
  float ringInner = 1.0 - smoothstep(0.22 - edgeSoftness, 0.22 + edgeSoftness, d);
  float ring = clamp(ringOuter - ringInner, 0.0, 1.0);

  float centerZone = clamp(midBlob, 0.0, 1.0);

  float waveA = sin((petalSpace.x * (4.0 + fi * 0.4) + petalSpace.y * (2.8 + fi * 0.3)) - t * speed * (1.2 + fi * 0.05)) * 0.5 + 0.5;
  float waveB = cos((petalSpace.y * (5.5 + fi * 0.5) - petalSpace.x * (2.4 + fi * 0.2)) + t * speed * (1.0 + fi * 0.04)) * 0.5 + 0.5;
  float waveC = sin(length(petalSpace) * (10.0 + fi * 0.8) - t * speed * (1.8 + fi * 0.03)) * 0.5 + 0.5;

  float modWave = 0.44 * waveA + 0.34 * waveB + 0.22 * waveC;

  flow += outerBlob * (0.40 + 0.30 * modWave);
  flow += midBlob * (0.55 + 0.25 * modWave);

  ringMask += ring;
  centerZoneMask += centerZone;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  vec3 bgColor = cosinePalettePreset(0.08, PALETTE_PRESET);

  vec2 p = uv - uOrbitCenter;
  p.x *= uResolution.x / uResolution.y;

  vec2 q = p;
  vec2 flowDir = vec2(sin(uDirection), cos(uDirection));
  vec2 acrossDir = vec2(-flowDir.y, flowDir.x);
  float along = dot(q, flowDir);
  float across = dot(q, acrossDir);

  float flow = 0.0;
  float ringMask = 0.0;
  float centerZoneMask = 0.0;

  addBlob(0.0, t, uSpeed, uSpin, uDirection, uPetalK, uBaseR, uPetalAmp, uEdgeSoftness, uPetalSize.x, uPetalSize.y, q, flow, ringMask, centerZoneMask);
  addBlob(1.0, t, uSpeed, uSpin, uDirection, uPetalK, uBaseR, uPetalAmp, uEdgeSoftness, uPetalSize.x, uPetalSize.y, q, flow, ringMask, centerZoneMask);
  addBlob(2.0, t, uSpeed, uSpin, uDirection, uPetalK, uBaseR, uPetalAmp, uEdgeSoftness, uPetalSize.x, uPetalSize.y, q, flow, ringMask, centerZoneMask);
  addBlob(3.0, t, uSpeed, uSpin, uDirection, uPetalK, uBaseR, uPetalAmp, uEdgeSoftness, uPetalSize.x, uPetalSize.y, q, flow, ringMask, centerZoneMask);
  addBlob(4.0, t, uSpeed, uSpin, uDirection, uPetalK, uBaseR, uPetalAmp, uEdgeSoftness, uPetalSize.x, uPetalSize.y, q, flow, ringMask, centerZoneMask);

  float baseWash = 0.0;
  baseWash += 0.5 + 0.5 * sin(along * 2.0 + t * 0.40);
  baseWash += 0.5 + 0.5 * cos(across * 2.6 - t * 0.35);
  baseWash += 0.5 + 0.5 * sin((along + across) * 1.8 + t * 0.25);
  baseWash /= 3.0;

  float centerBias = 1.0 - clamp(length(p) * 1.08, 0.0, 1.0);
  centerBias = smoothstep(0.0, 1.0, centerBias);

  flow = flow / 3.6;
  flow += baseWash * uBaseWashStrength;
  flow += centerBias * 0.12;
  flow = smoothstep(0.10, 0.88, flow);
  flow = mix(flow, 1.0, uFlowToFull);

  ringMask = clamp(ringMask / 2.5, 0.0, 1.0);
  centerZoneMask = clamp(centerZoneMask / 2.0, 0.0, 1.0);

  float paletteScroll = dot(p, flowDir) - t * uPaletteScrollSpeed;

  float wave1 = sin(along * 4.0 + across * 2.2 - t * 0.9);
  float wave2 = cos(across * 5.5 - along * 1.8 + t * 0.7);
  float wave3 = sin(length(q) * 8.0 - t * 1.1);

  float waveMix = 0.5 + 0.5 * (0.45 * wave1 + 0.35 * wave2 + 0.20 * wave3);
  float waveOffset = mix(-0.18, 0.18, waveMix);

  vec3 basePalette = cosinePalettePreset(paletteScroll + waveOffset, PALETTE_PRESET);
  vec3 darkPalette = cosinePalettePreset(paletteScroll + waveOffset - 0.12, PALETTE_PRESET);
  vec3 ringPalette = cosinePalettePreset(paletteScroll + waveOffset + 0.08, PALETTE_PRESET);
  vec3 fogPalette = cosinePalettePreset(paletteScroll + waveOffset - 0.22, PALETTE_PRESET);

  vec3 color = mix(bgColor, basePalette, flow);

  color = mix(color, darkPalette, ringMask * 0.18);
  color = mix(color, ringPalette, centerZoneMask * 0.45);

  vec3 fogColor = mix(fogPalette, bgColor, 0.45);
  color = mix(color, fogColor, uFogMix);

  float vignette = 1.0 - dot(p * 0.85, p * 0.85);
  vignette = clamp(vignette, 0.0, 1.0);
  vignette = pow(vignette, 1.08);

  color *= 0.99 + 0.04 * vignette;

  gl_FragColor = vec4(color, 1.0);
}
