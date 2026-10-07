import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three"

/** Halvings below full resolution; the last level is 1/64 of the screen. */
export const BLOOM_LEVELS = 6

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position, 1.0);
  }
`

// Full resolution to half by plain 2×2 averages, keeping only what's bright
// enough to glow. Read texel by texel: the image may be a format not every
// GPU can filter.
const reduceShader = /* glsl */ `
  uniform sampler2D uSource;
  uniform float uExposure;
  uniform float uThreshold;

  // A soft knee rather than a hard cut, so nothing pops in at the threshold.
  // Judged on screen brightness, exposure included: the glow follows what
  // you see as bright.
  vec3 brightPart(vec3 color) {
    const float knee = 0.5;
    float bright = max(color.r, max(color.g, color.b)) * uExposure;
    float soft = clamp(bright - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    return color * max(soft, bright - uThreshold) / max(bright, 1e-4);
  }

  void main() {
    ivec2 last = textureSize(uSource, 0) - 1;
    ivec2 p = ivec2(gl_FragCoord.xy) * 2;
    vec3 sum = brightPart(texelFetch(uSource, min(p, last), 0).rgb)
      + brightPart(texelFetch(uSource, min(p + ivec2(1, 0), last), 0).rgb)
      + brightPart(texelFetch(uSource, min(p + ivec2(0, 1), last), 0).rgb)
      + brightPart(texelFetch(uSource, min(p + ivec2(1, 1), last), 0).rgb);
    gl_FragColor = vec4(sum * 0.25, 1.0);
  }
`

// Jimenez's 13-tap downsample ("Next Generation Post Processing in Call of
// Duty: Advanced Warfare"): overlapping boxes, so nothing shimmers as it shrinks.
const downsampleShader = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 tap(vec2 offset) { return texture2D(uSource, vUv + offset * uTexel).rgb; }
  void main() {
    vec3 outer = (tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, 2.0)) + tap(vec2(-2.0, -2.0)) + tap(vec2(2.0, -2.0))) * 0.03125;
    vec3 edges = (tap(vec2(0.0, 2.0)) + tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, -2.0))) * 0.0625;
    vec3 inner = (tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)) + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0))) * 0.125;
    gl_FragColor = vec4(tap(vec2(0.0)) * 0.125 + outer + edges + inner, 1.0);
  }
`

// A 3×3 tent, added onto the next level up, so every level ends up carrying
// the blur of all the ones below it.
const upsampleShader = /* glsl */ `
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uRadius;
  varying vec2 vUv;
  vec3 tap(vec2 offset) { return texture2D(uSource, vUv + offset * uTexel * uRadius).rgb; }
  void main() {
    vec3 sum = tap(vec2(0.0)) * 4.0;
    sum += (tap(vec2(1.0, 0.0)) + tap(vec2(-1.0, 0.0)) + tap(vec2(0.0, 1.0)) + tap(vec2(0.0, -1.0))) * 2.0;
    sum += tap(vec2(1.0, 1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, -1.0));
    gl_FragColor = vec4(sum / 16.0, 1.0);
  }
`

/**
 * Highlight bloom in the Call of Duty / Unreal style: whatever is bright
 * enough is shrunk down a mip chain and blurred back up, and the composite
 * adds the glow back over the image.
 */
export class Bloom {
  /** Tent spread on the way back up, in texels of the smaller level. */
  radius = 1
  /** Scales the image to screen brightness before the threshold is judged. */
  exposure = 1
  /** Screen brightness (before tone mapping) above which things glow. */
  threshold = 1

  private readonly levels: WebGLRenderTarget[]
  private readonly reduce: ShaderMaterial
  private readonly downsample: ShaderMaterial
  private readonly upsample: ShaderMaterial
  private readonly geometry = new BufferGeometry()
  private readonly mesh: Mesh
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera()

  constructor() {
    this.levels = Array.from({ length: BLOOM_LEVELS }, (_, i) => {
      const target = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      })
      target.texture.name = `Global Illumination bloom ${i}`
      return target
    })
    const pass = (fragmentShader: string, uniforms: ShaderMaterial["uniforms"]) =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
      })
    this.reduce = pass(reduceShader, {
      uSource: { value: null },
      uExposure: { value: 1 },
      uThreshold: { value: 1 },
    })
    this.downsample = pass(downsampleShader, {
      uSource: { value: null },
      uTexel: { value: [1, 1] },
    })
    this.upsample = pass(upsampleShader, {
      uSource: { value: null },
      uTexel: { value: [1, 1] },
      uRadius: { value: 1 },
    })
    this.upsample.blending = AdditiveBlending

    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    this.mesh = new Mesh(this.geometry, this.reduce)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  /** The bloom, at half resolution, summed over every level. */
  get texture() {
    return this.levels[0].texture
  }

  setSize(width: number, height: number) {
    for (const target of this.levels) {
      width = Math.max(1, Math.ceil(width / 2))
      height = Math.max(1, Math.ceil(height / 2))
      target.setSize(width, height)
    }
  }

  render(renderer: WebGLRenderer, source: Texture) {
    const autoClear = renderer.autoClear
    renderer.autoClear = false

    this.reduce.uniforms.uSource.value = source
    this.reduce.uniforms.uExposure.value = this.exposure
    this.reduce.uniforms.uThreshold.value = this.threshold
    this.draw(renderer, this.reduce, this.levels[0])

    for (let i = 1; i < this.levels.length; i++) {
      const from = this.levels[i - 1]
      this.downsample.uniforms.uSource.value = from.texture
      this.downsample.uniforms.uTexel.value = [1 / from.width, 1 / from.height]
      this.draw(renderer, this.downsample, this.levels[i])
    }

    this.upsample.uniforms.uRadius.value = this.radius
    for (let i = this.levels.length - 1; i > 0; i--) {
      const from = this.levels[i]
      this.upsample.uniforms.uSource.value = from.texture
      this.upsample.uniforms.uTexel.value = [1 / from.width, 1 / from.height]
      this.draw(renderer, this.upsample, this.levels[i - 1])
    }

    renderer.autoClear = autoClear
  }

  dispose() {
    this.levels.forEach((target) => target.dispose())
    this.reduce.dispose()
    this.downsample.dispose()
    this.upsample.dispose()
    this.geometry.dispose()
  }

  private draw(renderer: WebGLRenderer, material: ShaderMaterial, target: WebGLRenderTarget) {
    this.mesh.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
  }
}
