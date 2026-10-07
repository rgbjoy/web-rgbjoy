// The accumulated light with its highlights glowing, filmic tone-mapped to
// the screen and darkened toward the corners.

uniform sampler2D uImage;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform float uExposure;

// three.js's ACES fit (Stephen Hill's RRT + ODT approximation).
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 acesFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color *= uExposure / 0.6;
  color = ACESOutputMat * RRTAndODTFit(ACESInputMat * color);
  return clamp(color, 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 hdr = max(texelFetch(uImage, ivec2(gl_FragCoord.xy), 0).rgb, vec3(0.0));
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Every bloom level is summed into the first; share them out evenly.
  vec3 glow = texture2D(uBloom, uv).rgb / float(BLOOM_LEVELS);
  vec3 light = hdr + glow * uBloomStrength;
  // A soft vignette, so the eye settles on the lit middle of the room.
  vec2 fromCentre = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  light *= 1.0 - 0.45 * smoothstep(0.35, 1.05, length(fromCentre));
  vec3 color = linearToSRGB(acesFilmic(light));
  // Half a step of dither so the dim walls don't band once the noise is gone.
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}
