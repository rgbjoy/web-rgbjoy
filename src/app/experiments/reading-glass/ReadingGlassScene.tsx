"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, type RefObject } from "react"
import { Color, MathUtils, Vector2, type Mesh, type ShaderMaterial } from "three"

import { buildTextTexture, MAX_COLUMN_WIDTH } from "./textTexture"

/** Height of the warped strip, in CSS pixels. */
const STRIP_HEIGHT = 300
/** Distance of the strip's top edge from the top of the viewport. */
const STRIP_TOP = 0
/** Blank space above the first line when scrolled to the very top. */
export const TOP_PADDING = 300
/** Blank space below the last line when scrolled to the very bottom. */
export const BOTTOM_PADDING = 300
/** Horizontal margin on each side of the text column, in CSS pixels. */
const SIDE_PADDING = 24
/** Don't let the column get narrower than this. */
const MIN_COLUMN_WIDTH = 280
/** Vertical magnification at the centre of the strip (<1 = text appears larger). */
const MAGNIFY = 0.85
/** Strength of the red/blue channel split inside the strip. */
const ABERRATION = 0.02
/** How much the lens also bulges outward horizontally (0 = none, 1 = matches vertical). */
const BULGE = 0.4
/** Easing exponent for the ramp (1 = smoothstep, higher = effect stays low longer then swells). */
const EASE = 2.5
/** Scroll easing rate — higher = snappier, lower = more inertial lag. */
const SMOOTH_LAMBDA = 6

const BG_COLOR = "#0d0d10"

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexture;
  uniform vec2 uResolution;   // viewport size, px
  uniform vec2 uTextSize;     // text column size, px (width, height)
  uniform float uScroll;      // window.scrollY, px
  uniform float uTopPadding;  // gap above first line at scroll 0, px
  uniform float uStripCenter; // strip centre, px from top
  uniform float uStripHalf;   // half strip height, px
  uniform float uMagnify;
  uniform float uAberration;
  uniform float uBulge;
  uniform float uEase;
  uniform vec3 uBg;

  varying vec2 vUv;

  // Colour of the article over the solid page background at a screen pixel.
  vec3 sampleText(vec2 screen) {
    float colLeft = (uResolution.x - uTextSize.x) * 0.5;
    float tx = (screen.x - colLeft) / uTextSize.x;
    float articleY = screen.y - uTopPadding + uScroll;
    float ty = articleY / uTextSize.y;
    if (tx < 0.0 || tx > 1.0 || ty < 0.0 || ty > 1.0) return uBg;
    // The CanvasTexture is top-left origin, so flip V.
    vec4 t = texture2D(uTexture, vec2(tx, 1.0 - ty));
    return mix(uBg, t.rgb, t.a);
  }

  void main() {
    vec2 screen = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);

    float sampleY = screen.y;
    float sampleX = screen.x;
    float ab = 0.0;
    float offset = uStripCenter - uStripHalf;  // gap from the viewport edge
    float cx = uResolution.x * 0.5;            // horizontal pivot (column centre)

    // Top wedge: thick at the very top, thinning to nothing at its bottom edge.
    {
      float top = uStripCenter - uStripHalf;
      float bottom = uStripCenter + uStripHalf;
      // p: 0 at the bottom edge, 1 at the top — the lens thickens upward.
      float p = clamp((bottom - screen.y) / (2.0 * uStripHalf), 0.0, 1.0);
      // pow(p) eases in gently where it meets the text (slope 0 at p=0) but keeps
      // accelerating out to the edge (no smoothstep plateau), so it never eases back off.
      float thickness = pow(p, uEase);
      // Pivot the remap on the bottom edge so it stays seamless with the text below.
      float scale = mix(1.0, uMagnify, thickness);
      float hScale = mix(1.0, scale, uBulge);  // matching outward bulge in X
      float bentY = bottom + (screen.y - bottom) * scale;
      float bentX = cx + (screen.x - cx) * hScale;
      float inStrip = step(top, screen.y) * step(screen.y, bottom);
      sampleY = mix(sampleY, bentY, inStrip);
      sampleX = mix(sampleX, bentX, inStrip);
      ab += uAberration * thickness * inStrip * uStripHalf;
    }

    // Bottom wedge: the mirror — thick at the very bottom, thinning to nothing
    // at its top edge, anchored to the bottom of the viewport.
    {
      float bottom = uResolution.y - offset;
      float top = bottom - 2.0 * uStripHalf;
      // p: 0 at the top edge, 1 at the bottom — the lens thickens downward.
      float p = clamp((screen.y - top) / (2.0 * uStripHalf), 0.0, 1.0);
      // pow(p) eases in gently where it meets the text (slope 0 at p=0) but keeps
      // accelerating out to the edge (no smoothstep plateau), so it never eases back off.
      float thickness = pow(p, uEase);
      // Pivot the remap on the top edge so it stays seamless with the text above.
      float scale = mix(1.0, uMagnify, thickness);
      float hScale = mix(1.0, scale, uBulge);
      float bentY = top + (screen.y - top) * scale;
      float bentX = cx + (screen.x - cx) * hScale;
      float inStrip = step(top, screen.y) * step(screen.y, bottom);
      sampleY = mix(sampleY, bentY, inStrip);
      sampleX = mix(sampleX, bentX, inStrip);
      ab -= uAberration * thickness * inStrip * uStripHalf;  // mirrored fringe
    }

    // Outside the wedges ab == 0, so one fetch covers all three channels; only
    // pay for the extra two samples where the chromatic split actually happens.
    vec3 col = sampleText(vec2(sampleX, sampleY));
    if (abs(ab) > 0.001) {
      col.r = sampleText(vec2(sampleX, sampleY + ab)).r;
      col.b = sampleText(vec2(sampleX, sampleY - ab)).b;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

type Props = {
  scrollRef: RefObject<number>
  image: HTMLImageElement
  onHeight?: (height: number) => void
  onReady?: () => void
}

export function ReadingGlassScene({ scrollRef, image, onHeight, onReady }: Props) {
  const { size, invalidate } = useThree()

  // Fit the column to the viewport (capped at MAX_COLUMN_WIDTH), and re-wrap the
  // text whenever that width changes so it stays readable on phones.
  const columnWidth = useMemo(
    () =>
      Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, Math.round(size.width - SIDE_PADDING * 2)),
      ),
    [size.width],
  )
  const { texture, width, height } = useMemo(
    () => buildTextTexture(columnWidth, image),
    [columnWidth, image],
  )

  const planeRef = useRef<Mesh>(null)
  const materialRef = useRef<ShaderMaterial>(null)
  const smoothScroll = useRef(0)
  const readySent = useRef(false)
  const textureRef = useRef(texture)
  const textSizeRef = useRef({ width, height })

  // One stable uniforms object — R3F doesn't reliably hot-swap a ShaderMaterial's
  // uniforms, so the values are updated imperatively in useFrame instead.
  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uResolution: { value: new Vector2(1, 1) },
      uTextSize: { value: new Vector2(width, height) },
      uScroll: { value: 0 },
      uTopPadding: { value: TOP_PADDING },
      uStripCenter: { value: STRIP_TOP + STRIP_HEIGHT / 2 },
      uStripHalf: { value: STRIP_HEIGHT / 2 },
      uMagnify: { value: MAGNIFY },
      uAberration: { value: ABERRATION },
      uBulge: { value: BULGE },
      uEase: { value: EASE },
      uBg: { value: new Color(BG_COLOR) },
    }),
    // Created once; values are pushed in imperatively when the texture rebuilds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Texture swap and scroll height only — uniform writes stay in useFrame so the
  // React Compiler doesn't see materialRef mutated from both effect and useFrame.
  useEffect(() => {
    textureRef.current = texture
    textSizeRef.current = { width, height }
    onHeight?.(height)
    invalidate()
    return () => texture.dispose()
  }, [texture, width, height, onHeight, invalidate])

  // Kick a render on every scroll; the settle in useFrame keeps frames coming.
  useEffect(() => {
    const onScroll = () => invalidate()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [invalidate])

  useFrame((_, delta) => {
    if (planeRef.current) {
      planeRef.current.scale.set(size.width, size.height, 1)
    }
    const mat = materialRef.current
    if (!mat) return

    mat.uniforms.uTexture.value = textureRef.current
    mat.uniforms.uTextSize.value.set(textSizeRef.current.width, textSizeRef.current.height)

    // Ease the scroll the shader sees toward the real scrollbar for an inertial feel.
    smoothScroll.current = MathUtils.damp(
      smoothScroll.current,
      scrollRef.current ?? 0,
      SMOOTH_LAMBDA,
      delta,
    )
    mat.uniforms.uScroll.value = smoothScroll.current
    mat.uniforms.uResolution.value.set(size.width, size.height)

    // Keep rendering until the eased scroll has caught up, then let it idle.
    if (Math.abs(smoothScroll.current - (scrollRef.current ?? 0)) > 0.25) {
      invalidate()
    }

    // Reveal the canvas only after this frame's uniforms are set and rendered.
    if (!readySent.current) {
      readySent.current = true
      requestAnimationFrame(() => onReady?.())
    }
  })

  return (
    <mesh ref={planeRef}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  )
}
