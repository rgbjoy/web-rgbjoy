// Paints the frame: every block in turn over the last, each a feathered
// rectangle (crisp on one edge, smeared on the next, sometimes in stair
// steps), flat or grading into a second colour. Colours stay gamma-encoded
// and blend as video does.

uniform sampler2D uBlocks;
uniform int uCount;
uniform vec2 uResolution;
uniform vec3 uBackground;

// Quantises 0–1 into `steps` treads; `riser` is a pixel in tread units, so
// each step's edge stays antialiased.
float stair(float t, float steps, float riser) {
  float q = t * steps;
  float w = clamp(riser, 1e-3, 0.5);
  return (floor(q) + smoothstep(0.5 - w, 0.5 + w, fract(q))) / steps;
}

// How much of an edge covers this pixel: `inside` is the distance in from
// it, `soft` the feather centred on it, both in screen heights.
float edge(float inside, float soft, float steps, float pixel) {
  float t = clamp(inside / soft + 0.5, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return steps > 0.5 ? stair(t, steps, 1.5 * steps * pixel / soft) : t;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float pixel = 1.0 / uResolution.y;
  vec3 color = uBackground;

  for (int i = 0; i < MAX_BLOCKS; i++) {
    if (i >= uCount) break;
    int x = i * 5;
    vec4 rect = texelFetch(uBlocks, ivec2(x, 0), 0);
    vec4 soft = texelFetch(uBlocks, ivec2(x + 1, 0), 0);

    // Nothing to do outside the block and its feathers.
    vec2 low = rect.xy - 0.5 * soft.xy / vec2(aspect, 1.0);
    vec2 high = rect.zw + 0.5 * soft.zw / vec2(aspect, 1.0);
    if (any(lessThan(uv, low)) || any(greaterThan(uv, high))) continue;

    vec4 a = texelFetch(uBlocks, ivec2(x + 2, 0), 0);
    vec4 b = texelFetch(uBlocks, ivec2(x + 3, 0), 0);
    float steps = texelFetch(uBlocks, ivec2(x + 4, 0), 0).x;

    float cover = edge((uv.x - rect.x) * aspect, soft.x, steps, pixel)
      * edge(uv.y - rect.y, soft.y, steps, pixel)
      * edge((rect.z - uv.x) * aspect, soft.z, steps, pixel)
      * edge(rect.w - uv.y, soft.w, steps, pixel);

    vec3 tone = a.rgb;
    if (b.w > 0.5) {
      bool across = b.w < 1.5;
      float span = across ? (rect.z - rect.x) * aspect : rect.w - rect.y;
      float g = clamp(across ? (uv.x - rect.x) / (rect.z - rect.x) : (uv.y - rect.y) / (rect.w - rect.y), 0.0, 1.0);
      g = g * g * (3.0 - 2.0 * g);
      if (steps > 0.5) g = stair(g, steps, steps * pixel / span);
      tone = mix(a.rgb, b.rgb, g);
    }

    color = mix(color, tone, a.a * cover);
  }

  gl_FragColor = vec4(color, 1.0);
}
