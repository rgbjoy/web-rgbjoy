"use client"

import { useFrame } from "@react-three/fiber"
import GUI from "lil-gui"
import { useEffect, useMemo, useRef } from "react"
import { Vector3, type ShaderMaterial } from "three"

import { hexToOklab, randomPalette } from "./palettes"

/** Max color stops the shader supports. */
const MAX_STOPS = 8

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Full-screen quad: geometry is 2x2 centred, so position.xy spans clip space.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  #define MAX 8

  uniform vec3 uColorsA[MAX];
  uniform int uCountA;
  uniform vec3 uColorsB[MAX];
  uniform int uCountB;
  uniform float uFade;      // 0 = palette A, 1 = palette B
  uniform float uAngle;     // gradient direction, radians
  uniform float uWarpAmp;   // organic undulation of the bands
  uniform float uWarpScale;
  uniform float uSmear;     // stretches the bands into streaks
  uniform float uSpeed;     // drift speed
  uniform float uGrain;     // dither to kill banding
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // Hash without sine (Dave Hoskins) — no diagonal moiré like the sin() version.
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float s = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) { s += amp * vnoise(p); p *= 2.0; amp *= 0.5; }
    return s;
  }

  // Multi-stop ramp in OKLab; smoothstep between stops gives natural "dwell".
  vec3 ramp(vec3 cols[MAX], int count, float t) {
    vec3 c = cols[0];
    for (int i = 0; i < MAX - 1; i++) {
      if (i >= count - 1) break;
      float a = float(i) / float(count - 1);
      float b = float(i + 1) / float(count - 1);
      c = mix(c, cols[i + 1], smoothstep(a, b, t));
    }
    return c;
  }

  vec3 oklabToLinear(vec3 lab) {
    float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
    float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return vec3(
       4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
  }

  vec3 linearToSrgb(vec3 c) {
    c = max(c, 0.0);
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, 12.92 * c, step(c, vec3(0.0031308)));
  }

  void main() {
    vec2 uv = vUv;
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    vec2 perp = vec2(-dir.y, dir.x);
    float base = dot(uv - 0.5, dir) + 0.5;

    // Smear: stretch the noise domain along the bands so features pull into long
    // streaks, and boost the warp amplitude with it.
    float aniso = 1.0 + uSmear * 6.0;
    vec2 nUv = dir * dot(uv, dir) + perp * (dot(uv, perp) / aniso);

    // Undulate and slowly drift the position so the bands feel alive.
    float w = fbm(nUv * uWarpScale + uTime * uSpeed);
    float amp = uWarpAmp * (1.0 + uSmear * 2.0);
    float t = clamp(base + (w - 0.5) * amp + 0.06 * sin(uTime * 0.08), 0.0, 1.0);

    vec3 lab = mix(ramp(uColorsA, uCountA, t), ramp(uColorsB, uCountB, t), uFade);
    vec3 col = linearToSrgb(oklabToLinear(lab));

    // Film grain: triangular-PDF dither (difference of two uniform hashes),
    // re-seeded every frame so it shimmers naturally with no fixed pattern.
    float g1 = hash13(vec3(gl_FragCoord.xy, uTime));
    float g2 = hash13(vec3(gl_FragCoord.xy, uTime + 1.7));
    col += (g1 - g2) * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`

/** Load a palette's stops (as OKLab) into a slot; returns the stop count. */
function fillStops(target: Vector3[], hexes: string[]): number {
  const n = Math.min(hexes.length, MAX_STOPS)
  for (let i = 0; i < MAX_STOPS; i++) {
    const [l, a, b] = hexToOklab(hexes[Math.min(i, n - 1)])
    target[i].set(l, a, b)
  }
  return n
}

export function GradientFlowScene() {
  const materialRef = useRef<ShaderMaterial>(null)
  const shuffleRef = useRef(false)

  // Live-tweakable settings (mirrored into the uniforms each frame). Kept in a
  // plain ref so lil-gui can mutate them without touching the material directly.
  const params = useRef({
    smear: 0,
    warpAmount: 0.18,
    warpScale: 1.6,
    speed: 0.03,
    grain: 0.025,
    angle: 90, // degrees
    fadeSeconds: 16,
  })

  const uniforms = useMemo(() => {
    const colorsA = Array.from({ length: MAX_STOPS }, () => new Vector3())
    const colorsB = Array.from({ length: MAX_STOPS }, () => new Vector3())
    return {
      uColorsA: { value: colorsA },
      uCountA: { value: fillStops(colorsA, randomPalette()) },
      uColorsB: { value: colorsB },
      uCountB: { value: fillStops(colorsB, randomPalette()) },
      uFade: { value: 0 },
      uAngle: { value: Math.PI / 2 }, // vertical
      uWarpAmp: { value: 0.18 },
      uWarpScale: { value: 1.6 },
      uSmear: { value: 0 },
      uSpeed: { value: 0.03 },
      uGrain: { value: 0.025 },
      uTime: { value: 0 },
    }
  }, [])

  // Space / click requests a jump to a fresh palette (handled in the frame loop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault()
        shuffleRef.current = true
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Tweak panel.
  useEffect(() => {
    const gui = new GUI({ title: "gradient flow" })
    const p = params.current
    gui.add(p, "smear", 0, 1, 0.01)
    gui.add(p, "warpAmount", 0, 1, 0.01).name("warp amount")
    gui.add(p, "warpScale", 0.2, 6, 0.01).name("warp scale")
    gui.add(p, "speed", 0, 0.2, 0.001)
    gui.add(p, "grain", 0, 0.1, 0.001)
    gui.add(p, "angle", 0, 360, 1)
    gui.add(p, "fadeSeconds", 2, 40, 1).name("fade secs")
    gui.add({ shuffle: () => (shuffleRef.current = true) }, "shuffle")

    // Press "h" to show/hide the panel (hidden by default).
    let hidden = true
    gui.show(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key !== "h" && e.key !== "H") return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea") return
      if (target?.isContentEditable) return

      hidden = !hidden
      gui.show(!hidden)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      gui.destroy()
    }
  }, [])

  useFrame((state, delta) => {
    const u = materialRef.current?.uniforms
    if (!u) return
    const p = params.current
    u.uTime.value = state.elapsed
    u.uAngle.value = (p.angle * Math.PI) / 180
    u.uWarpAmp.value = p.warpAmount
    u.uWarpScale.value = p.warpScale
    u.uSmear.value = p.smear
    u.uSpeed.value = p.speed
    u.uGrain.value = p.grain

    // Ease A -> B; when it arrives (or a shuffle is requested), promote B and
    // pick a new B so the gradient keeps drifting to fresh palettes.
    u.uFade.value += delta / p.fadeSeconds
    if (u.uFade.value >= 1 || shuffleRef.current) {
      shuffleRef.current = false
      for (let i = 0; i < MAX_STOPS; i++) u.uColorsA.value[i].copy(u.uColorsB.value[i])
      u.uCountA.value = u.uCountB.value
      u.uCountB.value = fillStops(u.uColorsB.value, randomPalette())
      u.uFade.value = 0
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  )
}
