// Public Domain under http://unlicense.org, see link for details.
//
// A Nishita93-style single scattering atmosphere approximation.
// Adapted for Three.js: uniforms, no iChannel0, mat2x3 -> out vec3 pair (WebGL1-friendly).

precision highp float;
precision highp int;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uSunDir;
uniform float uExposure;
uniform vec4 uMouse;

#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
#define iMouse uMouse

// Mathematical constants.

const float INF = 1e17;
const float pi = 3.14159265358979;

// Physical constants (see source comments in original).

const float au = 149597870700.0;
const float Rs = 6.957e8;
const float Sa = 6.79431e-5;
const float Re = 6.3781e6;

const float Esc = 128e3;

const float Lsun = Esc / Sa;

// Colorspace: CAS2RGB as column-major mat3 (pre-transposed from reference).

const mat3 CAS2RGB = mat3(
    1.6218, -0.0374, -0.0283,
    -0.4493, 1.0598, -0.1119,
    0.0325, -0.0742, 1.0491);

vec3 CASsun = vec3(0.9420, 1.0269, 1.0241);

vec3 CASrayleigh = vec3(7.2865e-6, 1.2863e-5, 2.7408e-5);

varying vec2 vUv;

vec2 quadratic_solve(float a, float b, float c) {
  float d = b * b - a * c;
  return d > 0.0 ? (-b + sqrt(d) * vec2(-1.0, +1.0)) / a : vec2(+INF, -INF);
}

float erf(float x) {
  x = clamp(x, -3.0, +3.0);
  return (1.13072 * x) / (1.0 + (x * x) * (0.357055 + (x * x) * -0.01014));
}

float erfcx(float x) {
  const float a = 0.4956;
  float y = (1.0 + a * abs(x)) / (1.0 + abs(x) * ((2.0 / sqrt(pi) + a) + sqrt(pi) * a * abs(x)));
  return x >= 0.0 ? y : 2.0 * exp(x * x) - y;
}

float gauss_segment(float x, float y, float z) {
  return y * z < 0.0 ? exp(x) * (erf(z) - erf(y))
                     : sign(y + z) * (exp(x - y * y) * erfcx(abs(y)) - exp(x - z * z) * erfcx(abs(z)));
}

float density_integral(float R, float H, float k, vec3 ro, vec3 rd, float l, float h) {
  float A = 0.5 / (R * H);
  float B = dot(ro, rd) / (R * H);
  float C = 0.5 * (dot(ro, ro) - R * R) / (R * H);
  float W = 0.25 * B * B / A - C;
  return 0.5 * k * sqrt(pi / A) *
         gauss_segment(W, sqrt(A) * l + 0.5 * B / sqrt(A), sqrt(A) * h + 0.5 * B / sqrt(A));
}

float phase_draine(float a, float g, float x) {
  float d = 1.0 + g * g - 2.0 * g * x;
  return 1.0 / (4.0 * pi) * (1.0 - g * g) / (1.0 + a * (1.0 + 2.0 * g * g) / 3.0) *
         (1.0 + a * x * x) / (d * sqrt(d));
}

float phase_rayleigh(float x) { return phase_draine(1.0, 0.0, x); }

vec4 phase_params_mie(float d) {
  d *= 1e6;
  return vec4(
      exp(-0.0990567 / (d - 1.67154)),
      exp(-2.20679 / (d + 3.91029) - 0.428934),
      exp(3.62489 - 8.29288 / (d + 5.52825)),
      exp(-0.599085 / (d - 0.641583) - 0.665888));
}

float phase_mie(vec4 M, float x) {
  return mix(phase_draine(0.0, M.x, x), phase_draine(M.z, M.y, x), M.w);
}

float turbidity2mie(float B550, float Hr, float Hm, float T) { return (T - 1.0) * B550 * Hr / Hm; }

float turbidity2mie(float Hr, float Hm, float T) { return turbidity2mie(1.149e-5, Hr, Hm, T); }

const int NUM_STEPS = 4;

void atmosphere(
    vec3 ro,
    vec3 rd,
    vec3 ld,
    float E,
    float R,
    vec3 Bsr,
    vec3 Bar,
    vec3 Bsm,
    vec3 Bam,
    float Hr,
    float Hm,
    vec4 M,
    vec2 seg,
    out vec3 outScatter,
    out vec3 outAlpha) {
  ld = normalize(ld);
  rd = normalize(rd);
  float Ra = R + 7.5 * (Hr + Hm);
  vec2 sp = quadratic_solve(1.0, dot(ro, rd), dot(ro, ro) - R * R);
  vec2 sa = quadratic_solve(1.0, dot(ro, rd), dot(ro, ro) - Ra * Ra);
  vec2 s = seg;
  if (sp.x < sp.y && sp.y > s.x)
    s.y = min(s.y, sp.x);
  vec3 Ber = Bsr + Bar;
  vec3 Bem = Bsm + Bam;
  vec3 alpha = 1.0 - exp(-(Ber * density_integral(R, Hr, 1.0, ro, rd, s.x, s.y) +
                          Bem * density_integral(R, Hm, 1.0, ro, rd, s.x, s.y)));
  s = vec2(max(s.x, sa.x), min(s.y, sa.y));
  vec3 po = ro - dot(ro, ld) * ld;
  vec3 pd = rd - dot(rd, ld) * ld;
  vec2 ss = quadratic_solve(dot(pd, pd), dot(po, pd), dot(po, po) - R * R);
  if (dot(rd, ld) > 0.0)
    ss.y = min(ss.y, -dot(ro, ld) / dot(rd, ld));
  else
    ss.x = max(ss.x, -dot(ro, ld) / dot(rd, ld));
  vec2 sl = s, sh = vec2(s.y);
  if (ss.x < ss.y)
    sl = vec2(s.x, min(s.y, ss.x));
  if (ss.x < ss.y)
    sh = vec2(max(s.x, ss.y), s.y);
  if (!(sl.x < sl.y)) {
    sl = vec2(sh.x, 0.5 * (sh.x + sh.y));
    sh = vec2(0.5 * (sh.x + sh.y), sh.y);
  } else if (!(sh.x < sh.y)) {
    sh = vec2(0.5 * (sl.x + sl.y), sl.y);
    sl = vec2(sl.x, 0.5 * (sl.x + sl.y));
  }
  vec3 Cr = vec3(0.0);
  vec3 Cm = vec3(0.0);
  float Pr = phase_rayleigh(dot(rd, ld));
  float Pm = phase_mie(M, dot(rd, ld));
  s = sl;
  for (int k = 0; k < 2; ++k) {
    if (s.x < s.y) {
      float dt = (s.y - s.x) / float(NUM_STEPS);
      vec3 B = Ber + Bem;
      float X = max(max(B.x, B.y), B.z) * dt;
      float offset = (X < 0.25 ? 0.5 - X / 24.0 : log(X / (1.0 - exp(-X))) / X);
      if (k == 1)
        offset = 1.0 - offset;
      for (int i = 0; i < NUM_STEPS; ++i) {
        float t = s.x + (float(i) + offset) * dt;
        vec3 r = ro + rd * t;
        float h = (dot(r, r) - R * R) / (2.0 * R);
        float Dr = density_integral(R, Hr, 1.0, ro, rd, 0.0, t) + density_integral(R, Hr, 1.0, r, ld, 0.0, INF);
        float Dm = density_integral(R, Hm, 1.0, ro, rd, 0.0, t) + density_integral(R, Hm, 1.0, r, ld, 0.0, INF);
        vec3 a = exp(-(Ber * Dr + Bem * Dm));
        Cr += exp(-h / Hr) * a * dt;
        Cm += exp(-h / Hm) * a * dt;
      }
    }
    s = sh;
  }
  outScatter = E * (Pr * Bsr * Cr + Pm * Bsm * Cm);
  outAlpha = alpha;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float F = 1.5;
  float R = Re;
  vec3 ro = vec3(0.0, R + 80.0, 5.0);
  vec3 rd = normalize(vec3((2.0 * fragCoord - iResolution.xy) / iResolution.y, -F));
  vec3 md = normalize(vec3((2.0 * iMouse.xy - iResolution.xy) / iResolution.y, -F));
  vec3 ld = normalize(uSunDir);
  if (length(iMouse.xy) > 16.0)
    ld = md;

  float Hr = 7.994e3, Hm = 1.2e3;
  float T = 1.375;
  float D = 17e-6;
  vec3 Bsr = CASrayleigh, Bar = vec3(0.0);
  vec3 Bsm = vec3(turbidity2mie(Hr, Hm, T)), Bam = vec3(0.0);
  vec4 M = phase_params_mie(D);

  float Lref = 7e3;
  vec3 col = vec3(1e-7);
  vec2 s = quadratic_solve(1.0, dot(ro, rd), dot(ro, ro) - R * R);

  col += Lsun * CASsun * smoothstep(1.0 - (0.5 * Rs * Rs / (au * au)), 1.0, dot(rd, ld));

  if (s.x < s.y && s.y > 0.0) {
    col = vec3(0.0);
  }

  vec3 atmC, atmA;
  atmosphere(ro, normalize(rd), normalize(ld), Esc, R, Bsr, Bar, Bsm, Bam, Hr, Hm, M, vec2(0.0, INF), atmC, atmA);
  col = CASsun * atmC + col * (1.0 - atmA);
  col = CAS2RGB * col;

  col *= uExposure;
  col = 1.0 - exp(-col / Lref);
  col = mix(12.92 * col, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  fragColor = vec4(col, 1.0);
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec4 color;
  mainImage(color, fragCoord);
  gl_FragColor = color;
}
