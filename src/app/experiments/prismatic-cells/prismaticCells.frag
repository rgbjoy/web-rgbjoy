#ifdef GL_ES
precision highp float;
#endif

// If you intend to reuse this shader, please add credits to 'Danilo Guanabara'

uniform vec2 uResolution;
uniform float uTime;
uniform float uTimeScale;
uniform float uStepZ;
uniform float uWarpFreq;
uniform float uSinBias;
uniform float uWarpStrength;
uniform float uCellGlow;
uniform float uCellScale;

varying vec2 vUv;

void main() {
  vec3 c = vec3(0.0);
  float l = 0.0;
  float z = uTime * uTimeScale;
  vec2 r = uResolution.xy;

  for (int i = 0; i < 3; i++) {
    vec2 uv = gl_FragCoord.xy / r;
    vec2 p = uv;
    p -= 0.5;
    p.x *= r.x / r.y;
    z += uStepZ;
    l = length(p);
    uv += (p / max(l, 0.0001)) *
      (sin(z) + uSinBias) *
      abs(sin(l * uWarpFreq - z - z)) *
      uWarpStrength;
    c[i] = uCellGlow / length(mod(uv * uCellScale, 1.0) - 0.5);
  }

  gl_FragColor = vec4(c / max(l, 0.001), 1.0);
}
