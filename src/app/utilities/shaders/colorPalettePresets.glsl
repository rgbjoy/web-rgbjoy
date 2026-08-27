#pragma glslify: cosinePalette = require('./colorPalette.glsl')

// Preset indices:
// 0 triad       — d(0.00, 0.33, 0.67)
// 1 cool drift  — d(0.00, 0.10, 0.20)
// 2 warm shift  — d(0.30, 0.20, 0.20)
// 3 gold        — c(1.0, 1.0, 0.5) d(0.80, 0.90, 0.30)
// 4 sunset      — c(1.0, 0.7, 0.4) d(0.00, 0.15, 0.20)
// 5 fire        — c(2.0, 1.0, 0.0) d(0.50, 0.20, 0.25)
// 6 earth       — a(0.8, 0.5, 0.4) b(0.2, 0.4, 0.2) c(2.0, 1.0, 1.0) d(0.00, 0.25, 0.25)

vec3 cosinePalettePreset(in float t, in float preset) {
  if (preset < 0.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.33, 0.67));
  } else if (preset < 1.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.00, 0.10, 0.20));
  } else if (preset < 2.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.30, 0.20, 0.20));
  } else if (preset < 3.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.80, 0.90, 0.30));
  } else if (preset < 4.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(1.0, 0.7, 0.4), vec3(0.00, 0.15, 0.20));
  } else if (preset < 5.5) {
    return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.50, 0.20, 0.25));
  }
  return cosinePalette(t, vec3(0.8, 0.5, 0.4), vec3(0.2, 0.4, 0.2), vec3(2.0, 1.0, 1.0), vec3(0.00, 0.25, 0.25));
}

#pragma glslify: export(cosinePalettePreset)
