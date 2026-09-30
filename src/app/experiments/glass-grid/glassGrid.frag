#ifdef GL_ES
precision highp float;
#endif

uniform float uTime;
uniform float uAspectRatio;
uniform vec2 uPointer;
varying vec2 vUv;

const float PI = 3.14159265;

float softGlow(float distance, float width) {
    float d = distance / width;
    return exp(-d * d);
}

// A broad, asymmetric light ribbon: honey above, a thin copper edge below.
// Evaluated analytically so the glass needs no blur textures or extra passes.
vec3 amberLight(vec2 uv, float time) {
    vec2 p = uv - 0.5;
    p.x *= uAspectRatio;
    float sweep = sin(p.x * 1.65 + time * 0.19);
    float ribbon = 0.04 + sweep * 0.23;
    ribbon += sin(p.x * 3.1 - time * 0.13 + 0.8) * 0.035;
    ribbon += uPointer.y * 0.065 + uPointer.x * p.x * 0.035;
    float distance = p.y - ribbon;

    float width = 0.19 + 0.04 * sin(p.x * 1.8 + time * 0.21);
    float upperGlow = softGlow(distance, width);
    upperGlow *= smoothstep(-0.035, 0.025, distance);
    float core = softGlow(distance - 0.075, 0.095);
    float copper = softGlow(distance + 0.032, 0.065);
    float haze = exp(-abs(distance) * 5.5);

    vec3 color = mix(vec3(0.010, 0.018, 0.017), vec3(0.055, 0.035, 0.012),
        smoothstep(-0.25, 0.5, p.y));
    color += vec3(0.18, 0.055, 0.008) * haze;
    color += vec3(0.23, 0.042, 0.023) * copper;
    color += vec3(0.76, 0.32, 0.055) * upperGlow;
    color += vec3(0.62, 0.47, 0.29) * core;

    // A second, dim reflection drifts independently behind the main ribbon.
    float reflection = p.y + ribbon * 0.65 + 0.35;
    color += vec3(0.14, 0.065, 0.012) * exp(-reflection * reflection * 32.0);
    return color;
}

void main() {
    vec2 uv = vUv;
    float count = clamp(uAspectRatio * 25.0, 12.0, 30.0);
    float flute = uv.x * count;
    float cell = floor(flute);
    float local = fract(flute);
    float roundness = sin(local * PI);

    // Thick ribbed glass gathers a wider piece of the scene into each flute.
    // Log compression makes the ribbon taper into a sharp point at each seam.
    float lens = log(1.0 + local * 22.0) / log(23.0);
    vec2 refracted = vec2((cell + lens * 1.85 - 0.42) / count, uv.y);
    refracted.y += (1.0 - roundness) * 0.075;
    refracted.y += sin(cell * 0.73 + uTime * 0.17) * 0.009 * roundness;
    vec3 color = amberLight(refracted, uTime);

    // Dark rolled edges and a fine champagne reflection give each rib depth.
    float body = 0.68 + 0.32 * pow(roundness, 0.55);
    color *= body;
    float aa = max(fwidth(local), 0.001);
    float seam = 1.0 - smoothstep(0.0, aa * 1.3, local);
    float glint = softGlow(local - 0.08, 0.035);
    float lightHeight = 0.35 + 0.65 * softGlow(uv.y - 0.6, 0.667);
    color += vec3(0.12, 0.10, 0.06) * seam * lightHeight;
    color += vec3(0.025, 0.016, 0.006) * glint;
    color *= 1.0 - 0.35 * smoothstep(0.87, 1.0, local);

    vec2 vignette = (uv - 0.5) * vec2(1.1, 0.8);
    color *= 1.0 - dot(vignette, vignette) * 0.45;
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color += (grain - 0.5) * 0.006;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
