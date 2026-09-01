"use client"

import { useEffect, useRef } from "react"

import styles from "./RgbLogo.module.css"

/**
 * The three bars as one field rather than three elements.
 *
 * Each bar's response is its own distance to the pointer, so moving across the
 * mark cross-fades between them rather than switching.
 *
 * Hovering a bar does two things CSS structurally cannot: it pushes a ripple
 * through the shared coordinate space, so the *other* two bars bend — sibling
 * elements can never displace each other's pixels — and it fans that bar across
 * the spectrum along its own width, so colour varies per pixel inside a shape
 * rather than per element. The bars themselves stay hard-edged; there is no
 * glow.
 *
 * Raw WebGL2 on purpose. three is not on the index page and this mark is not
 * worth putting it there.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform float u_time;
uniform vec2 u_resolution;
/** 0 freezes the hue drift and the ripple; hover still responds. */
uniform float u_motion;
/** Eased 0..1 per bar. Smoothed on the CPU so hover in and out both ramp. */
uniform vec3 u_hover;

out vec4 outColor;

/* The artwork occupies the middle two thirds of the canvas. The rest is bleed,
   so the ripple has room to push a bar past the mark's own edge instead of
   being clipped against it. */
const vec2 BAR_HALF = vec2(0.070, 0.233);
const float BAR_GAP = 0.193;
const float BAR_Y = 0.5;

float barCenter(float i) {
  return 0.5 + (i - 1.0) * BAR_GAP;
}

/** Vector components are not dynamically indexable everywhere; branch instead. */
float hoverAt(int i) {
  return i == 0 ? u_hover.x : (i == 1 ? u_hover.y : u_hover.z);
}

/** Distance to a bar, negative inside — the sign is what fills it. */
float barDistance(vec2 p, float centerX) {
  vec2 d = abs(p - vec2(centerX, BAR_Y)) - BAR_HALF;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/**
 * Rodrigues rotation about the grey axis — a true hue turn, so colour moves
 * without brightness following it.
 */
vec3 hueShift(vec3 c, float angle) {
  const vec3 axis = vec3(0.57735);
  float cosA = cos(angle);
  return c * cosA + cross(axis, c) * sin(angle) +
    axis * dot(axis, c) * (1.0 - cosA);
}

void main() {
  float t = u_time * u_motion;
  // Half a device pixel, so the bar edge antialiases instead of stairstepping.
  float aa = 0.7 / u_resolution.y;

  // Every hovered bar drives a ring outward through the field, and all three
  // bars are then sampled in the displaced space. This is the whole argument for
  // a shader: the effect belongs to the field, not to any one bar.
  vec2 warp = vec2(0.0);
  for (int j = 0; j < 3; j++) {
    float hv = hoverAt(j);
    vec2 delta = v_uv - vec2(barCenter(float(j)), BAR_Y);
    float dist = length(delta) + 1e-4;
    float ring = sin(dist * 42.0 - t * 9.0 - hv * 3.0);
    warp += (delta / dist) * ring * 0.030 * hv * exp(-dist * 4.0);
  }

  vec2 uv = v_uv + warp;

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float centerX = barCenter(fi);
    float hv = hoverAt(i);

    float d = barDistance(uv, centerX);
    // Not smoothstep(aa, -aa, d): GLSL leaves smoothstep undefined when
    // edge0 >= edge1, and drivers that take the strict reading return 0, which
    // erases the bar entirely. Invert an in-order ramp instead.
    float core = 1.0 - smoothstep(-aa, aa, d);
    // Idle: a couple of degrees of drift, each bar on its own phase.
    float drift = sin(t * 0.37 + fi * 2.1) * 0.045;
    // Hover: the bar stops being one colour and smears across the spectrum along
    // its own width. Sampled per pixel, which is why tint is inside the loop.
    float across = clamp((uv.x - centerX) / BAR_HALF.x, -1.0, 1.0);
    float prism = across * hv * 2.3;

    vec3 primary = vec3(
      i == 0 ? 1.0 : 0.0,
      i == 1 ? 1.0 : 0.0,
      i == 2 ? 1.0 : 0.0
    );
    vec3 tint = hueShift(primary, drift + prism);

    color += tint * core;
    alpha += core;
  }

  outColor = vec4(color, clamp(alpha, 0.0, 1.0));
}`

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }

  return shader
}

/*
 * Pointer maths. The pointer arrives in the wrapper's coordinates but the bars
 * live in the canvas's, and the canvas is deliberately the larger of the two —
 * so these reconcile the two spaces rather than hard-coding a second set of
 * positions that could drift from the shader's.
 */
/** Must match --bleed in the stylesheet. */
const BLEED_RATIO = 0.25
/** Must match BAR_GAP in the fragment shader. */
const BAR_GAP_UV = 0.193
const MARK_SPAN = 1 / (1 + BLEED_RATIO * 2)
const MARK_ORIGIN = BLEED_RATIO / (1 + BLEED_RATIO * 2)

/** Bar centres in wrapper space: 0 at the mark's left edge, 1 at its right. */
const BAR_CENTERS = [0, 1, 2].map(
  (i) => (0.5 + (i - 1) * BAR_GAP_UV - MARK_ORIGIN) / MARK_SPAN,
)
/** One unit of falloff is the distance to the next bar's centre. */
const BAR_PITCH = BAR_GAP_UV / MARK_SPAN
/**
 * Bars are far taller than they are wide, so raw 2D distance would leave their
 * top and bottom barely responding while the middle lit fully. Scaling the
 * vertical term keeps the whole length of a bar live.
 */
const VERTICAL_WEIGHT = 0.3

export function RgbLogo() {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    })
    if (!gl || gl.isContextLost()) return

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    // Attached shaders live as long as the program once it has linked.
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }

    gl.useProgram(program)

    // One triangle covering the clip volume — cheaper than a quad and it has no
    // seam down the diagonal.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )

    const position = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, "u_time")
    const uResolution = gl.getUniformLocation(program, "u_resolution")
    const uMotion = gl.getUniformLocation(program, "u_motion")
    const uHover = gl.getUniformLocation(program, "u_hover")

    // No gl.BLEND on purpose. This is one triangle onto a freshly cleared
    // buffer, so there is nothing to blend against — and blending would write
    // premultiplied values into a context declared premultipliedAlpha: false,
    // leaving the browser to multiply by alpha a second time on composite.

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))

      // Only the buffer resize is conditional. Viewport and uniform are set every
      // time: a freshly linked program starts with u_resolution at zero, and
      // StrictMode's second mount finds the canvas already at the right size, so
      // an early return here would leave that program's resolution unset —
      // which makes the antialias width 0.7/0 and floods the mark.
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      gl.viewport(0, 0, width, height)
      gl.uniform2f(uResolution, width, height)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const target = [0, 0, 0]
    const hover = [0, 0, 0]

    const isStill = () => document.documentElement.dataset.motion === "reduced"

    // Keep drawing while anything is still easing, even under reduced motion —
    // otherwise hover would snap instead of ramping.
    const settling = () =>
      hover.some((value, i) => Math.abs(value - target[i]) > 0.002)

    let frame = 0
    let running = false
    const start = performance.now()

    const render = () => {
      running = true
      const still = isStill()

      for (let i = 0; i < 3; i++) {
        hover[i] += (target[i] - hover[i]) * 0.16
      }

      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform1f(uMotion, still ? 0 : 1)
      gl.uniform3f(uHover, hover[0], hover[1], hover[2])

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // A still mark needs one frame, not sixty — but hover still has to ease.
      if (still && !settling()) {
        running = false
        return
      }

      frame = requestAnimationFrame(render)
    }

    const ensureRunning = () => {
      if (!running) render()
    }

    // Listeners live on the wrapper, not the canvas: the canvas overflows the
    // mark's box to give the ripple room, and it must not intercept pointer
    // events meant for the wordmark beside it.
    const onMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height

      for (let i = 0; i < 3; i++) {
        const dx = (px - BAR_CENTERS[i]) / BAR_PITCH
        const dy = ((py - 0.5) * VERTICAL_WEIGHT) / BAR_PITCH
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Smoothstep over the distance still to go: 1 on a bar's own centre,
        // 0 once the pointer reaches its neighbour. Bars are no longer exclusive,
        // so between two of them both sit at half and cross-fade.
        const t = Math.max(0, Math.min(1, 1 - distance))
        target[i] = t * t * (3 - 2 * t)
      }

      ensureRunning()
    }

    const onLeave = () => {
      for (let i = 0; i < 3; i++) target[i] = 0
      ensureRunning()
    }

    wrap.addEventListener("pointermove", onMove)
    wrap.addEventListener("pointerleave", onLeave)

    render()

    const motionObserver = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      running = false
      ensureRunning()
    })
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      motionObserver.disconnect()
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerleave", onLeave)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // Deliberately no WEBGL_lose_context here. Losing the context is permanent
      // for the canvas element — getContext hands the same dead context back —
      // so under StrictMode's mount/cleanup/mount the second run inherits a
      // context that can never draw. The GPU resources go with the canvas when
      // React removes it; deleting the program and buffer is the whole job.
    }
  }, [])

  return (
    <span ref={wrapRef} className={styles.logo} role="img" aria-label="rgbjoy">
      <canvas ref={canvasRef} className={styles.canvas} />
    </span>
  )
}
