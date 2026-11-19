"use client"

import { useEffect, useRef } from "react"

import fragmentShader from "./prism.frag"

/** One triangle that covers the whole canvas; the fragment shader does the rest. */
const VERTEX_SHADER = "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }"

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

type Pointer = { x: number; y: number; pull: number }

/** Returns a draw function for the given time and cursor, or null when WebGL isn't available. */
function setup(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false })
  if (!gl) return null
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const resolution = gl.getUniformLocation(program, "uResolution")
  const time = gl.getUniformLocation(program, "uTime")
  const pointer = gl.getUniformLocation(program, "uPointer")
  const pull = gl.getUniformLocation(program, "uPull")
  return (seconds: number, cursor: Pointer = { x: 0, y: 0, pull: 0 }) => {
    // Soft light needs no extra pixels, so it renders at CSS size even on dense screens.
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
    gl.uniform2f(resolution, width, height)
    gl.uniform1f(time, seconds)
    gl.uniform2f(pointer, cursor.x, cursor.y)
    gl.uniform1f(pull, cursor.pull)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

/**
 * Follows a mouse anywhere on the page, eased so the light turns toward it slowly.
 * Listens on the window, so the canvas never blocks clicks; touch is ignored.
 */
function followPointer(canvas: HTMLCanvasElement) {
  const target: Pointer = { x: 0, y: 0, pull: 0 }
  const eased: Pointer = { x: 0, y: 0, pull: 0 }

  // Canvas pixels with the origin at the bottom left, as the shader counts them.
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    const box = canvas.getBoundingClientRect()
    target.x = event.clientX - box.left
    target.y = box.bottom - event.clientY
    target.pull = 1
  }
  const leave = () => {
    target.pull = 0
  }
  window.addEventListener("pointermove", move)
  document.documentElement.addEventListener("mouseleave", leave)

  return {
    /** Moves a little closer to the cursor each frame. */
    step() {
      // Arriving from nothing, start at the cursor rather than sweeping in from a corner.
      const ease = eased.pull < 0.01 ? 1 : 0.04
      eased.x += (target.x - eased.x) * ease
      eased.y += (target.y - eased.y) * ease
      eased.pull += (target.pull - eased.pull) * 0.03
      return eased
    },
    stop() {
      window.removeEventListener("pointermove", move)
      document.documentElement.removeEventListener("mouseleave", leave)
    },
  }
}

/** Foil-coloured light falling in from the top right corner, leaning toward the mouse. Still under reduced motion. */
export function Prism({ className, still }: { className?: string; still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const draw = canvas && setup(canvas)
    if (!canvas || !draw) return

    // A fixed moment that looks good, for reduced motion.
    if (still) {
      draw(3)
      return
    }

    // Pinned to the window, so it's always in view; the browser pauses frames in a background tab.
    const pointer = followPointer(canvas)
    let frame = 0
    const tick = (now: number) => {
      draw(now / 1000, pointer.step())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      pointer.stop()
    }
  }, [still])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
