"use client"

import { useEffect, useRef, useState } from "react"

import styles from "./HoloBackground.module.css"

/**
 * The paper behind the index: a pastel wash, cool at the top and warm further
 * down, with a fine grain over it. It drifts on its own while the page sits
 * still, and travels up with the page — a little slower than the text, and
 * churning harder the faster you go — when it scrolls. The mouse tips it like
 * holographic foil: where the cursor sits turns the colours across the whole
 * screen, and the wash swirls and shifts hue beneath it.
 *
 * The colours run in a loop, so an index that never ends never runs out of
 * them. Raw WebGL2 for the same reason as the logo: three is not on this page.
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

uniform vec2 u_resolution;
/** Idle drift, in noise units. Advances faster while the page is moving. */
uniform float u_drift;
/** How far the field has travelled with the page, in screen heights. */
uniform float u_scroll;
/** 0..1, how hard the page is being scrolled right now. */
uniform float u_stir;
uniform vec3 u_stops[5];
uniform float u_grain;
uniform float u_glow;
uniform float u_contrast;
uniform float u_saturation;
/** Cursor, in the same space as screen below. */
uniform vec2 u_pointer;
/** 0..1: eases in while the mouse is over the page, out when it leaves. */
uniform float u_presence;
/** The solid colour both ends fade into, and how much of the height each fade takes. */
uniform vec3 u_edge;
uniform float u_fade;
uniform float u_fadeTop;

out vec4 outColor;

// 2D simplex noise — Ashima Arts / Ian McEwan, MIT licence.
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p);
    p = p * 2.02 + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return value;
}

/** The five stops as a loop: each blends into the next, and the last back
 *  into the first. */
vec3 palette(float t) {
  float x = fract(t) * 5.0;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    // Distance to this stop around the loop, in stops.
    float d = abs(mod(x - float(i) + 2.5, 5.0) - 2.5);
    color += u_stops[i] * (1.0 - smoothstep(0.0, 1.0, d));
  }
  return color;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 screen = vec2(v_uv.x * aspect, 1.0 - v_uv.y);

  // The cursor stirs the wash where it rests: a soft twist of the field around
  // it, strongest beneath the pointer and gone a third of a screen away, and
  // tighter while the page is moving.
  vec2 fromPointer = screen - u_pointer;
  float lens = exp(-dot(fromPointer, fromPointer) / 0.09) * u_presence;
  float twist = lens * (0.9 + 0.8 * u_stir);
  float tc = cos(twist);
  float ts = sin(twist);
  vec2 twisted = u_pointer + mat2(tc, ts, -ts, tc) * fromPointer;

  // y runs down the page and on with the scroll, so the field rides up with
  // the content instead of sitting still behind it.
  vec2 p = twisted + vec2(0.0, u_scroll);

  vec2 warp = vec2(
    fbm(p * 0.85 + vec2(u_drift, -0.6 * u_drift)),
    fbm(p * 0.85 + vec2(5.2 - 0.8 * u_drift, 1.3 + u_drift))
  );
  vec2 q = p + warp * (0.28 + 0.16 * u_stir);

  // Foil tipped toward the light: the cursor's place on screen turns the whole
  // sweep, and the patch beneath it runs further round the wheel.
  float tilt = ((u_pointer.x / aspect - 0.5) * 0.18 + (u_pointer.y - 0.5) * 0.12) * u_presence;
  float t = q.y * 0.5 + q.x * 0.08 + fbm(q * 1.3 - 0.5 * u_drift) * 0.1
    + tilt + lens * 0.22;
  vec3 color = palette(t);

  // Pushed past the stops themselves: more colour, and a wider spread between
  // the light and the deep parts, pivoting on the wash's own brightness so the
  // page does not get darker overall.
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color = (color - 0.86) * u_contrast + 0.86;

  // A little light caught under the cursor.
  color += lens * 0.035;

  // A wash of light from the upper right, like paper near a window.
  float glow = 1.0 - smoothstep(0.0, 1.3, distance(screen, vec2(aspect * 0.8, 0.15)));
  color += glow * u_glow;

  // Fine grain fixed to the screen, like the tooth of the paper.
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color += grain * u_grain;

  // Both ends fade to one flat colour, grain and all: the same colour the
  // page's own background is set to, so the wash runs on under Safari's
  // status bar and toolbar, past where it can be drawn, without a seam at
  // either end. The first and last rows are that colour exactly.
  float inset = 1.5 / u_resolution.y;
  float fadeBottom = 1.0 - smoothstep(inset, u_fade, v_uv.y);
  float fadeTop = smoothstep(1.0 - u_fadeTop, 1.0 - inset, v_uv.y);
  color = mix(clamp(color, 0.0, 1.0), u_edge, max(fadeBottom, fadeTop));

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`

/** Top to bottom, then round again, after the Stripe Press wash: cool blue,
 *  warm white, apricot, rose, lilac. Mirrored in the module CSS as the fallback
 *  before WebGL is up. */
const STOPS = ["#c6d6e3", "#f2eee4", "#f7d9a8", "#f5bfbd", "#d4c6ec"]
const GRAIN = 0.04
const GLOW = 0.035
/** Spread around the wash's mid-brightness, and colour beyond the stops'. */
const CONTRAST = 1.18
const SATURATION = 1.22

/** Screen heights the field travels per screen of page scrolled: it moves with
 *  the page, a little behind it. */
const PARALLAX = 0.35
/** Drift speeds in noise units per second, blended by scroll and pointer activity. */
const IDLE_DRIFT_RATE = 0.07
const FULL_STIR_DRIFT_RATE = 0.28
/** Scroll speed, px per second, that counts as stirring it as hard as it goes. */
const STIR_FULL = 2400
/** How quickly the stir follows the scroll speed, per second. */
const STIR_EASE = 5
/** Mouse speed, in screen heights per second, that stirs it as hard as it goes.
 *  Higher than it sounds: the mouse should tease it, scrolling should churn it. */
const MOUSE_STIR_FULL = 6
/** How quickly the wash follows the cursor, and fades its effect in and out,
 *  per second. Slow enough to feel like liquid catching up. */
const POINTER_EASE = 4
const PRESENCE_EASE = 2.5
/** Shares of the height over which the bottom and the top fade to one solid
 *  colour. */
const FADE = 0.22
const FADE_TOP = 0.14
/** How often that colour is read back from the wash where the fades begin,
 *  and how quickly it drifts toward what it reads, per second. Slow, so the
 *  flat ends follow the gradient without flickering. */
const EDGE_INTERVAL_MS = 500
const EDGE_EASE = 1.5
/** Least time between changes to the page's background: each one repaints
 *  the page's root. */
const EDGE_APPLY_MS = 100

function stopsToFloats(): Float32Array {
  return new Float32Array(
    STOPS.flatMap((hex) => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ]),
  )
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.error(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return null
}

export function HoloBackground({
  scroll,
  still = false,
}: {
  /** Page scroll in px, read once a frame. Must not jump when the page jumps
   *  for layout reasons — the endless index wraps — or the wash jumps too. */
  scroll: () => number
  /** Reduced motion: one still frame, redrawn only on resize. */
  still?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef(scroll)
  // Bumped when a lost WebGL context comes back, to build everything again on it.
  const [contextGeneration, setContextGeneration] = useState(0)

  useEffect(() => {
    scrollRef.current = scroll
  }, [scroll])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    })
    // No WebGL: the CSS gradient under the canvas is the background.
    if (!gl || gl.isContextLost()) return

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }
    gl.useProgram(program)

    // One triangle over the clip volume: no diagonal seam, fewer vertices.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, "u_resolution")
    const uDrift = gl.getUniformLocation(program, "u_drift")
    const uScroll = gl.getUniformLocation(program, "u_scroll")
    const uStir = gl.getUniformLocation(program, "u_stir")
    gl.uniform3fv(gl.getUniformLocation(program, "u_stops"), stopsToFloats())
    gl.uniform1f(gl.getUniformLocation(program, "u_grain"), GRAIN)
    gl.uniform1f(gl.getUniformLocation(program, "u_glow"), GLOW)
    gl.uniform1f(gl.getUniformLocation(program, "u_contrast"), CONTRAST)
    gl.uniform1f(gl.getUniformLocation(program, "u_saturation"), SATURATION)
    const uPointer = gl.getUniformLocation(program, "u_pointer")
    const uPresence = gl.getUniformLocation(program, "u_presence")
    const uEdge = gl.getUniformLocation(program, "u_edge")
    gl.uniform1f(gl.getUniformLocation(program, "u_fade"), FADE)
    gl.uniform1f(gl.getUniformLocation(program, "u_fadeTop"), FADE_TOP)

    // A soft gradient gains nothing from device pixels, and the grain reads as
    // paper at one dot per CSS pixel. Keeps the per-pixel noise cheap.
    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth))
      const height = Math.max(1, Math.round(canvas.clientHeight))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    // A random start, so every visit opens on a slightly different wash.
    let drift = Math.random() * 1.4
    let stir = 0
    let scrollY = scrollRef.current()

    // The cursor in shader space: x and y both in screen heights, y down.
    // `target` is where it is; `pointer` eases after it.
    const target = { x: 0, y: 0, presence: 0 }
    const pointer = { x: 0, y: 0, presence: 0 }
    let pointerSeen = false
    let pointerTravel = 0

    /*
     * Safari on iOS draws the page past the viewport, under its status bar and
     * floating toolbar, where no fixed element reaches and only the page's own
     * background shows. So both ends of the wash fade to one solid colour, and
     * the page's background is set to exactly that colour: the wash meets it
     * without a seam at either end. The colour is the mean of the two rows
     * where the fades begin, eased toward each new reading.
     *
     * Reading pixels back makes the CPU wait for the GPU to finish drawing, a
     * stall every time. So after the first frame the read is queued into a
     * buffer behind a fence, and collected on a later frame once the fence
     * has passed — never waited on.
     */
    const root = document.documentElement
    const edgeTarget = [0, 0, 0]
    const edgeNow = [0, 0, 0]
    let edgeReady = false
    let edgeReadAt = -Infinity
    let edgeAppliedAt = -Infinity
    let appliedR = -1
    let appliedG = -1
    let appliedB = -1
    let rows = new Uint8Array(0)
    const packBuffer = gl.createBuffer()
    let pending: WebGLSync | null = null
    let pendingWidth = 0
    let lost = false

    /** The rows where the bottom and top fades begin, counted from the bottom
     *  as GL counts them: the wash itself, untouched by either fade. */
    const edgeRows = () => {
      const height = canvas.height
      return [
        Math.min(height - 1, Math.floor(height * FADE)),
        Math.max(0, height - 1 - Math.floor(height * FADE_TOP)),
      ]
    }

    const ensureRows = (width: number) => {
      if (rows.length < width * 8) rows = new Uint8Array(width * 8)
    }

    /** Averages two read rows into the target. A read from a dead context
     *  comes back as zeros, alpha included, and is ignored rather than easing
     *  the page toward black. */
    const averageRows = (width: number) => {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const count = width * 2
      for (let i = 0; i < count; i++) {
        r += rows[i * 4]
        g += rows[i * 4 + 1]
        b += rows[i * 4 + 2]
        a += rows[i * 4 + 3]
      }
      if (a / count < 128) return false
      edgeTarget[0] = r / count / 255
      edgeTarget[1] = g / count / 255
      edgeTarget[2] = b / count / 255
      return true
    }

    /** Reads straight back, waiting on the GPU. Only where a frame cannot show
     *  without the colour: the first, and a still one. */
    const readNow = () => {
      if (gl.isContextLost()) return false
      const width = canvas.width
      const [bottom, top] = edgeRows()
      ensureRows(width)
      gl.readPixels(0, bottom, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, rows, 0)
      gl.readPixels(0, top, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, rows, width * 4)
      return averageRows(width)
    }

    /** Queues the same read into a buffer the GPU fills in its own time. */
    const requestRead = () => {
      if (pending || gl.isContextLost()) return
      const width = canvas.width
      const [bottom, top] = edgeRows()
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer)
      gl.bufferData(gl.PIXEL_PACK_BUFFER, width * 8, gl.STREAM_READ)
      gl.readPixels(0, bottom, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0)
      gl.readPixels(0, top, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, width * 4)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      pending = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
      pendingWidth = width
      gl.flush()
    }

    /** Collects a queued read if the GPU has finished it. Never blocks: a zero
     *  timeout only asks. */
    const collectRead = () => {
      if (!pending || gl.isContextLost()) return
      const status = gl.clientWaitSync(pending, 0, 0)
      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) return
      gl.deleteSync(pending)
      pending = null
      ensureRows(pendingWidth)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer)
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rows, 0, pendingWidth * 8)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      averageRows(pendingWidth)
    }

    /** The shader's solid colour and the page's background, set together to
     *  the same rounded value so they are never a shade apart. */
    const applyEdge = (force = false) => {
      if (gl.isContextLost()) return
      const now = performance.now()
      if (!force && now - edgeAppliedAt < EDGE_APPLY_MS) return
      const r = Math.round(edgeNow[0] * 255)
      const g = Math.round(edgeNow[1] * 255)
      const b = Math.round(edgeNow[2] * 255)
      if (r === appliedR && g === appliedG && b === appliedB) return
      edgeAppliedAt = now
      appliedR = r
      appliedG = g
      appliedB = b
      gl.uniform3f(uEdge, r / 255, g / 255, b / 255)
      root.style.backgroundColor = `rgb(${r} ${g} ${b})`
    }

    const draw = () => {
      if (gl.isContextLost()) return
      resize()
      gl.uniform2f(uResolution, canvas.width, canvas.height)
      gl.uniform1f(uDrift, drift)
      gl.uniform1f(uScroll, (scrollY / Math.max(1, canvas.clientHeight)) * PARALLAX)
      gl.uniform1f(uStir, stir)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.uniform1f(uPresence, pointer.presence)
      if (edgeReady) applyEdge()
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!edgeReady || still) {
        // Take the colour as read and draw again with it, rather than showing
        // a frame that fades into nothing.
        if (readNow()) {
          edgeReady = true
          edgeNow[0] = edgeTarget[0]
          edgeNow[1] = edgeTarget[1]
          edgeNow[2] = edgeTarget[2]
          applyEdge(true)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
        }
      } else {
        const now = performance.now()
        if (now - edgeReadAt >= EDGE_INTERVAL_MS) {
          edgeReadAt = now
          requestRead()
        }
      }
      canvas.dataset.ready = "true"
    }

    let frame = 0
    let last = performance.now()
    let tick = 0

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now

      const nextScroll = scrollRef.current()
      const moved = nextScroll !== scrollY
      const speed = dt > 0 ? Math.abs(nextScroll - scrollY) / dt : 0
      scrollY = nextScroll

      const mouseSpeed = dt > 0 ? pointerTravel / dt : 0
      pointerTravel = 0
      const stirTarget = Math.min(1, Math.max(speed / STIR_FULL, mouseSpeed / MOUSE_STIR_FULL))
      stir += (stirTarget - stir) * (1 - Math.exp(-STIR_EASE * dt))
      drift += dt * (IDLE_DRIFT_RATE + stir * (FULL_STIR_DRIFT_RATE - IDLE_DRIFT_RATE))

      const follow = 1 - Math.exp(-POINTER_EASE * dt)
      pointer.x += (target.x - pointer.x) * follow
      pointer.y += (target.y - pointer.y) * follow
      pointer.presence += (target.presence - pointer.presence) * (1 - Math.exp(-PRESENCE_EASE * dt))
      const settling =
        Math.abs(target.x - pointer.x) + Math.abs(target.y - pointer.y) > 0.001 ||
        Math.abs(target.presence - pointer.presence) > 0.002

      collectRead()
      const toward = 1 - Math.exp(-EDGE_EASE * dt)
      for (let i = 0; i < 3; i++) edgeNow[i] += (edgeTarget[i] - edgeNow[i]) * toward

      // Idle, the drift is slow enough that every other frame is plenty.
      tick += 1
      if (!moved && !settling && stir < 0.01 && tick % 2 === 1) return
      draw()
    }

    // Mouse and pen only. A finger on a phone is scrolling, and the wash
    // already answers that.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      // From the canvas's own corner, in case it ever stops sitting at 0,0.
      const box = canvas.getBoundingClientRect()
      const height = Math.max(1, box.height)
      const x = (event.clientX - box.left) / height
      const y = (event.clientY - box.top) / height
      if (!pointerSeen) {
        // First sighting: start the eased cursor here, so the swirl fades in
        // where the mouse is instead of sliding over from the corner.
        pointerSeen = true
        pointer.x = x
        pointer.y = y
      } else {
        pointerTravel += Math.hypot(x - target.x, y - target.y)
      }
      target.x = x
      target.y = y
      target.presence = 1
    }
    const onPointerGone = () => {
      target.presence = 0
    }

    // A lost context draws nothing and reads back nothing. Stop, hand the
    // page back its own background and let the CSS gradient show, and ask for
    // the context back; when it returns, everything is built again on it.
    const onContextLost = (event: Event) => {
      event.preventDefault()
      lost = true
      cancelAnimationFrame(frame)
      pending = null
      delete canvas.dataset.ready
      root.style.removeProperty("background-color")
    }
    const onContextRestored = () => setContextGeneration((generation) => generation + 1)
    canvas.addEventListener("webglcontextlost", onContextLost)
    canvas.addEventListener("webglcontextrestored", onContextRestored)

    const observer = new ResizeObserver(() => {
      if (still) draw()
    })
    observer.observe(canvas)

    if (still) {
      draw()
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true })
      document.documentElement.addEventListener("mouseleave", onPointerGone)
      window.addEventListener("blur", onPointerGone)
      frame = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", onContextRestored)
      // Other pages keep their own background.
      root.style.removeProperty("background-color")
      window.removeEventListener("pointermove", onPointerMove)
      document.documentElement.removeEventListener("mouseleave", onPointerGone)
      window.removeEventListener("blur", onPointerGone)
      // Objects from a lost context belong to nothing now; leave them be.
      if (!lost && !gl.isContextLost()) {
        if (pending) gl.deleteSync(pending)
        gl.deleteBuffer(packBuffer)
        gl.deleteBuffer(buffer)
        gl.deleteProgram(program)
      }
      // No WEBGL_lose_context: it is permanent for the canvas, so StrictMode's
      // second mount would inherit a context that can never draw.
    }
  }, [still, contextGeneration])

  return (
    <div className={styles.container} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
