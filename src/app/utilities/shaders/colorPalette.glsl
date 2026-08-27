// Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
// a + b * cos(2π * (c * t + d))

vec3 cosinePalette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
  return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}

#pragma glslify: export(cosinePalette)
