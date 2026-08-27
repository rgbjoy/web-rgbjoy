uniform float uTime;
uniform vec2 uResolution;
uniform float uDirectionAngle;
uniform vec3 uMoonPosition;
uniform float uDebugMode;

varying vec2 vUv;

#define iTime uTime
#define iResolution vec3(uResolution, 1.0)

#define t iTime
#define pi 3.14159265359
#define norm normalize

const vec3 failure = vec3(-1e9);

bool isFailure(vec3 v) {
    return v.x < -1e8;
}

float hash(float x) {
    return fract(sin(x) * 43758.5453123);
}

float wave(float x) {
    // remap domain
    float rx = mod(x, 2.0 * pi);
    rx -= 2.0 * (rx - pi) * step(pi, rx);

    // coefficients from wave.c
    float m = 5.0;
    float nCoeff = 0.2;
    float a = 0.947154;
    float b = -0.165649;
    float c = 8.876987;
    float k = -7.711339;

    // wave function
    return a * rx + b * exp(-m * rx) + c * exp(-nCoeff * rx) + k;
}

float dwave(float x) {
    // remap domain
    float rx = mod(x, 2.0 * pi);
    float drxdx = 1.0 - step(pi, rx) * 2.0;
    rx -= 2.0 * (rx - pi) * step(pi, rx);

    // coefficients from wave.c
    float m = 5.0;
    float nCoeff = 0.2;
    float a = 0.947154;
    float b = -0.165649;
    float c = 8.876987;
    float k = -7.711339;

    // differential of wave function
    return (a + -b * m * exp(-m * rx) + -c * nCoeff * exp(-nCoeff * rx)) * drxdx;
}

float waves(vec2 p) {
    float r = 0.0;

    float f = 1.0;
    float a = 0.1;

    for (float i = 0.0; i < 4.0; ++i) {
        float o = hash(i) * 10.0;
        // Base direction controlled from the UI; each octave gets a small jitter for a natural look.
        vec2 baseDir = vec2(cos(uDirectionAngle), sin(uDirectionAngle));
        float jitter = (hash(i + 0.1) - 0.5) * 1.0;
        float cj = cos(jitter);
        float sj = sin(jitter);
        vec2 d = vec2(baseDir.x * cj - baseDir.y * sj, baseDir.x * sj + baseDir.y * cj);
        d = norm(d);
        float s = dot(d, p) * f + o - f * t;

        r += wave(s) * a;

        float m = 1.05;

        f = f * m;
        a = a / m;
    }

    return r;
}

vec2 dwaves(vec2 p) {
    vec2 dr = vec2(0.0);

    float f = 1.0;
    float a = 0.1;

    // r = sum_i wave(s_i)
    for (float i = 0.0; i < 4.0; ++i) {
        float o = hash(i) * 10.0;
        vec2 baseDir = vec2(cos(uDirectionAngle), sin(uDirectionAngle));
        float jitter = (hash(i + 0.1) - 0.5) * 1.0;
        float cj = cos(jitter);
        float sj = sin(jitter);
        vec2 d = vec2(baseDir.x * cj - baseDir.y * sj, baseDir.x * sj + baseDir.y * cj);
        d = norm(d);

        float s = dot(d, p) * f + o - f * t;

        // d(wave_i + waves) = d_wave_i + d_waves
        dr += dwave(s) * a * f * d;

        float m = 1.05;

        f = f * m;
        a = a / m;
    }

    return dr;
}

vec3 intPlane(vec3 ro, vec3 rd, vec4 plane) {
    float t = (dot(ro, plane.xyz) - plane.w) / -dot(rd, plane.xyz);

    if (t < 0.0) return failure;
    return ro + t * rd;
}

vec3 marchWaves(vec3 ro, vec3 rd) {
    vec4 surfPlane = vec4(0.0, 1.0, 0.0, 0.0);
    if (isFailure(intPlane(ro, rd, surfPlane))) return failure;

    vec3 p = ro;

    for (float i = 0.0; i < 100.0; ++i) {
        float d = p.y - waves(p.xz);

        if (d < 0.01) return p;

        p += d * rd;
    }

    return p;
}

float moon(vec3 rd) {
    float a = dot(rd, norm(uMoonPosition));
    return 0.015 / sqrt(1.0 - a) + 0.1 * exp(-abs(rd.y) * 10.0)
        + hash(rd.y + hash(rd.z)) * 1e-2;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec3 light = vec3(0.0);
    vec3 normal = vec3(0.5);
    float heightField = 0.0;
    float moonTerm = 0.0;
    float failureMask = 0.0;

    vec2 p = (fragCoord - iResolution.xy * 0.5)
        / min(iResolution.x, iResolution.y) * 2.0;

    vec3 rd = norm(vec3(p.x, p.y, -2.0));
    rd = rd.zyx;
    vec3 ro = vec3(0.0, 1.0, 0.0);

    vec3 wavesPos = marchWaves(ro, rd);

    if (!isFailure(wavesPos)) {
        vec2 ddxddz = dwaves(wavesPos.xz);

        vec3 ddx = vec3(1.0, ddxddz.x, 0.0);
        vec3 ddz = vec3(0.0, ddxddz.y, 1.0);
        normal = norm(cross(ddz, ddx));

        vec3 refl = rd - 2.0 * normal * dot(rd, normal);
        moonTerm = moon(refl) * exp(-0.02 * length(wavesPos));
        heightField = wavesPos.y;
        light = vec3(moonTerm);
    } else {
        failureMask = 1.0;
        moonTerm = moon(rd);
        light = vec3(moonTerm);
    }

    vec3 outCol = light;
    if (uDebugMode < 0.5) {
        outCol = light;
    } else if (uDebugMode < 1.5) {
        outCol = normal * 0.5 + 0.5;
    } else if (uDebugMode < 2.5) {
        outCol = vec3(0.5 + 0.5 * tanh(heightField));
    } else if (uDebugMode < 3.5) {
        outCol = vec3(failureMask);
    } else if (uDebugMode < 4.5) {
        outCol = vec3(0.5 + 0.5 * tanh(moonTerm));
    }

    fragColor = vec4(outCol, 1.0);
}

void main() {
    vec2 fragCoord = vUv * uResolution;
    vec4 color;
    mainImage(color, fragCoord);
    gl_FragColor = color;
}
