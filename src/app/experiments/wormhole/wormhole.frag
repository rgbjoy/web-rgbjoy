#ifdef GL_ES
precision highp float;
#endif

#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
const float AMBIENT_LIGHT = 0.48;

uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

vec3 path(float z) {
    return vec3(
        sin(z * 0.03) * 10.0,
        cos(z * 0.02) * 8.0,
        z
    );
}

float flower(vec3 p) {
    float r = length(p.xy);
    float a = atan(p.y, p.x);
    float petals = sin(a * 2.0 + p.z * 0.6) * 0.15;
    return r - (2.0 + petals);
}

float ring(vec3 p) {
    float r = length(p.xy);
    return abs(r - 2.0) - 3.5;
}

float mapDist(vec3 p) {
    vec3 c = path(p.z);
    p.xy -= c.xy;
    p.xy *= rot(p.z * 0.2);
    float d1 = flower(p);
    float d2 = ring(p);
    return min(d1, d2) * 0.8;
}

vec3 localTunnelPos(vec3 p) {
    vec3 c = path(p.z);
    p.xy -= c.xy;
    p.xy *= rot(p.z * 0.2);
    return p;
}

vec3 getNormal(vec3 p) {
    float h = 0.001;
    vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * mapDist(p + k.xyy * h) +
        k.yyx * mapDist(p + k.yyx * h) +
        k.yxy * mapDist(p + k.yxy * h) +
        k.xxx * mapDist(p + k.xxx * h)
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    float time = iTime * 25.0;

    vec3 ro = path(time);
    vec3 target = path(time + 10.0);

    vec3 forward = normalize(target - ro);
    vec3 right = normalize(vec3(forward.z, 0.0, -forward.x));
    vec3 up = cross(right, forward);
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);

    float t = 0.0;
    float d;
    vec3 pSurf;
    const int MAX_STEPS = 100;
    const float MAX_DIST = 200.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        pSurf = ro + rd * t;
        d = mapDist(pSurf);
        if (abs(d) < 0.001) {
            break;
        }
        if (t > MAX_DIST) break;
        t += d;
    }

    vec3 n = getNormal(pSurf);
    vec3 localP = localTunnelPos(pSurf);
    float stripeCoord = localP.z * 0.04;
    float stripeMask = step(0.5, fract(stripeCoord));
    float facing = 0.85 + 0.15 * abs(dot(n, -rd));
    vec3 stripeColor = vec3(stripeMask) * facing;
    fragColor = vec4(stripeColor, 1.0);
}

void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec4 color;
    mainImage(color, fragCoord);
    gl_FragColor = color;
}
