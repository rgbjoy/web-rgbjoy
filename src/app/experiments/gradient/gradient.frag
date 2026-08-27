// gradient.frag

#pragma glslify: noise = require('glsl-noise/simplex/3d')

uniform float uTime;
uniform float uAspectRatio; // width / height
// Config Uniforms
uniform vec3 uColourPalette[4];
uniform float uUvScale; // 1.0
uniform float uUvDistortionIterations; // 4.0
uniform float uUvDistortionIntensity; // 0.2

varying vec2 vUv;

// Color palette function
// http://dev.thi.ng/gradients/
vec3 cosineGradientColour(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
  return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}

void main() {
  // Cover: gradient has 3:2 AR, scaled to fill viewport (crop excess)
  float coverScale = max(uAspectRatio / 3.0, 1.0 / 2.0);
  vec2 uv;
  uv.x = 0.5 + (vUv.x * uAspectRatio - uAspectRatio * 0.5) / (3.0 * coverScale);
  uv.y = 0.5 + (vUv.y - 0.5) / (2.0 * coverScale);
  uv *= uUvScale;

  // Distort the uv coordinates with noise iterations
  for (float i = 0.0; i < uUvDistortionIterations; i++) {
    uv += noise(vec3(uv - i * 0.2, uTime + i * 32.)) * uUvDistortionIntensity;
  }

  float colourInput = noise(vec3(uv, sin(uTime))) * 0.5 + 0.5;
  vec3 colour = cosineGradientColour(colourInput, uColourPalette[0], uColourPalette[1], uColourPalette[2], uColourPalette[3]);

  gl_FragColor = vec4(colour, 1.0);
}
