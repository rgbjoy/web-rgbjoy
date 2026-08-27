#ifdef GL_ES
precision highp float;
#endif

// Aurora by @kishimisu (2024) — https://www.shadertoy.com/view/M3dSzs
// CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
// Ported from Shadertoy; iChannel3 noise replaced with a procedural hash.

uniform float uTime;
uniform vec2 uResolution;
uniform float uTimeScale;
uniform float uSpinY;
uniform float uTumbleX;
uniform float uCameraZ;
uniform float uSphereRadius;
uniform float uIntensity;
uniform float uColorScale;
uniform float uFadeDistance;
uniform float uSteps;
uniform float uPulseStrength;
uniform float uPulseSpeed;
uniform float uPulseFreq;
uniform float uPulseFalloff;
uniform float uLineThickness;
uniform float uLineLength;

varying vec2 vUv;

const float MAX_STEPS = 64.0;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Golfed 2D rotation: mat2(cos(t + vec4(0,33,11,0))) ≈ [[c,-s],[s,c]]
mat2 rot2(float t) {
    return mat2(cos(t + vec4(0.0, 33.0, 11.0, 0.0)));
}

void main() {
    vec2 F = vUv * uResolution;
    vec3 A = vec3(uResolution, 1.0);
    float a = uTime * uTimeScale;

    vec4 O = vec4(0.0);
    float R = 0.0;
    float steps = clamp(uSteps, 1.0, MAX_STEPS);

    for (float u = 0.0; u < MAX_STEPS; u++) {
        if (u >= steps) break;

        vec3 p = R * normalize(vec3(F + F - A.xy, A.y));
        p.z -= uCameraZ;

        float r = length(p);
        p /= r * 0.1;

        // Spin the aurora pattern on the sphere — yaw + pitch so it tumbles, not just spins.
        p.xz *= rot2(a * uSpinY);
        p.yz *= rot2(a * uTumbleX);

        float o = min(r - uSphereRadius, hash21(F) * 0.1) + 0.1;
        R += o;

        O += uIntensity / (0.4 + o)
            * mix(
                smoothstep(
                    0.5,
                    0.7,
                    sin(p.x + cos(p.y) * cos(p.z))
                        * sin(p.z + sin(p.y) * cos(p.x + a))
                ),
                1.0,
                0.15 / (r * r)
            )
            * smoothstep(uFadeDistance, 0.0, r)
            // Phase relative to sphere surface so camera / radius don't shift the rainbow.
            * (1.0 + cos((R - uCameraZ + uSphereRadius) * uColorScale + vec4(0.0, 1.0, 2.0, 0.0)));

        // Pulsating light radiating from the sphere center — soft core + expanding rings.
        float breathe = 0.55 + 0.45 * sin(a * uPulseSpeed);
        float rings = sin(r * uPulseFreq - a * uPulseSpeed);
        rings = smoothstep(0.55, 1.0, rings);
        float core = exp(-r * r * uPulseFalloff);
        float glow = (core * 1.4 + rings * core * 2.2) * breathe;
        O += uPulseStrength * glow / (0.4 + o)
            * vec4(1.0, 0.88, 0.72, 1.0)
            * smoothstep(uFadeDistance, 0.0, r);
    }

    // Pure black diagonal at a true 45° (aspect-corrected), centered.
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 c = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 dir = vec2(0.70710678, 0.70710678);
    float along = dot(c, dir);
    float across = abs(dot(c, vec2(-dir.y, dir.x)));
    float line = step(across, uLineThickness * 0.5) * step(abs(along), uLineLength * 0.5);
    O.rgb = mix(O.rgb, vec3(0.0), line);

    gl_FragColor = O;
}
