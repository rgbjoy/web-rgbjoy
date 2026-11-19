/** Halvings below full resolution; the last level is 1/64 of the screen. */
export const BLOOM_LEVELS = 6

const FORMAT: GPUTextureFormat = "rgba16float"
/** One pass's parameters per slot, spaced as uniform offsets must be. */
const SLOT = 256
/** The reduce pass, then a downsample and an upsample per level below the first. */
const PASSES = 1 + 2 * (BLOOM_LEVELS - 1)

const shader = /* wgsl */ `
  struct Params {
    texel: vec2f,
    radius: f32,
    exposure: f32,
    threshold: f32,
  }
  @group(0) @binding(0) var<uniform> params: Params;
  @group(0) @binding(1) var source: texture_2d<f32>;
  @group(0) @binding(2) var bilinear: sampler;

  struct Varyings {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  }

  // One triangle over the whole target, its uv in texture space (v down), so
  // every level keeps the rows the right way round.
  @vertex fn fullscreen(@builtin(vertex_index) i: u32) -> Varyings {
    let corner = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
    return Varyings(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(corner.x, 1.0 - corner.y));
  }

  // A soft knee rather than a hard cut, so nothing pops in at the threshold.
  // Judged on screen brightness, exposure included: the glow follows what
  // you see as bright.
  fn brightPart(color: vec3f) -> vec3f {
    let knee = 0.5;
    let bright = max(color.r, max(color.g, color.b)) * params.exposure;
    var soft = clamp(bright - params.threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    return color * max(soft, bright - params.threshold) / max(bright, 1e-4);
  }

  // Full resolution to half by plain 2×2 averages, keeping only what's bright
  // enough to glow.
  @fragment fn reduce(v: Varyings) -> @location(0) vec4f {
    let last = vec2i(textureDimensions(source)) - 1;
    let p = vec2i(v.position.xy) * 2;
    let sum = brightPart(textureLoad(source, min(p, last), 0).rgb)
      + brightPart(textureLoad(source, min(p + vec2i(1, 0), last), 0).rgb)
      + brightPart(textureLoad(source, min(p + vec2i(0, 1), last), 0).rgb)
      + brightPart(textureLoad(source, min(p + vec2i(1, 1), last), 0).rgb);
    return vec4f(sum * 0.25, 1.0);
  }

  fn tap(uv: vec2f, offset: vec2f) -> vec3f {
    return textureSampleLevel(source, bilinear, uv + offset * params.texel * params.radius, 0.0).rgb;
  }

  // Jimenez's 13-tap downsample ("Next Generation Post Processing in Call of
  // Duty: Advanced Warfare"): overlapping boxes, so nothing shimmers as it shrinks.
  @fragment fn downsample(v: Varyings) -> @location(0) vec4f {
    let outer = (tap(v.uv, vec2f(-2.0, 2.0)) + tap(v.uv, vec2f(2.0, 2.0)) + tap(v.uv, vec2f(-2.0, -2.0)) + tap(v.uv, vec2f(2.0, -2.0))) * 0.03125;
    let edges = (tap(v.uv, vec2f(0.0, 2.0)) + tap(v.uv, vec2f(-2.0, 0.0)) + tap(v.uv, vec2f(2.0, 0.0)) + tap(v.uv, vec2f(0.0, -2.0))) * 0.0625;
    let inner = (tap(v.uv, vec2f(-1.0, 1.0)) + tap(v.uv, vec2f(1.0, 1.0)) + tap(v.uv, vec2f(-1.0, -1.0)) + tap(v.uv, vec2f(1.0, -1.0))) * 0.125;
    return vec4f(tap(v.uv, vec2f(0.0)) * 0.125 + outer + edges + inner, 1.0);
  }

  // A 3×3 tent, added onto the next level up, so every level ends up carrying
  // the blur of all the ones below it.
  @fragment fn upsample(v: Varyings) -> @location(0) vec4f {
    var sum = tap(v.uv, vec2f(0.0)) * 4.0;
    sum += (tap(v.uv, vec2f(1.0, 0.0)) + tap(v.uv, vec2f(-1.0, 0.0)) + tap(v.uv, vec2f(0.0, 1.0)) + tap(v.uv, vec2f(0.0, -1.0))) * 2.0;
    sum += tap(v.uv, vec2f(1.0, 1.0)) + tap(v.uv, vec2f(-1.0, 1.0)) + tap(v.uv, vec2f(1.0, -1.0)) + tap(v.uv, vec2f(-1.0, -1.0));
    return vec4f(sum / 16.0, 1.0);
  }
`

type Pass = {
  pipeline: GPURenderPipeline
  target: GPUTextureView
  bindGroup: GPUBindGroup
  /** Upsamples add onto what the level already holds. */
  additive: boolean
}

/**
 * Highlight bloom in the Call of Duty / Unreal style: whatever is bright
 * enough is shrunk down a mip chain and blurred back up, and the display
 * adds the glow back over the image. Each step is a render pass reading its
 * parameters from its own slot of one buffer.
 */
export class Bloom {
  /** Tent spread on the way back up, in texels of the smaller level. */
  radius = 1
  /** Scales the image to screen brightness before the threshold is judged. */
  exposure = 1
  /** Screen brightness (before tone mapping) above which things glow. */
  threshold = 1

  private levels: GPUTexture[] = []
  private passes: Pass[] = []
  private readonly params = new Float32Array((PASSES * SLOT) / 4)
  private readonly buffer: GPUBuffer
  private readonly layout: GPUBindGroupLayout
  private readonly sampler: GPUSampler

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipelines: { reduce: GPURenderPipeline; downsample: GPURenderPipeline; upsample: GPURenderPipeline },
    layout: GPUBindGroupLayout,
  ) {
    this.layout = layout
    this.buffer = device.createBuffer({
      label: "Bloom parameters",
      size: PASSES * SLOT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.sampler = device.createSampler({ label: "Bloom", minFilter: "linear", magFilter: "linear" })
  }

  static async create(device: GPUDevice, compile: (label: string, code: string) => Promise<GPUShaderModule>) {
    const shaderModule = await compile("bloom.wgsl", shader)
    const layout = device.createBindGroupLayout({
      label: "Bloom",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    })
    const pipelineLayout = device.createPipelineLayout({ label: "Bloom", bindGroupLayouts: [layout] })
    const pipeline = (entryPoint: string, blend?: GPUBlendState) =>
      device.createRenderPipelineAsync({
        label: `Bloom ${entryPoint}`,
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: "fullscreen" },
        fragment: { module: shaderModule, entryPoint, targets: [{ format: FORMAT, blend }] },
      })
    const add: GPUBlendComponent = { srcFactor: "one", dstFactor: "one", operation: "add" }
    const [reduce, downsample, upsample] = await Promise.all([
      pipeline("reduce"),
      pipeline("downsample"),
      pipeline("upsample", { color: add, alpha: add }),
    ])
    return new Bloom(device, { reduce, downsample, upsample }, layout)
  }

  /** The bloom, at half resolution, summed over every level. */
  get view() {
    return this.levels[0].createView()
  }

  /** Sizes the chain below a full-resolution image, and reads from it. */
  setSize(width: number, height: number, image: GPUTexture) {
    this.levels.forEach((level) => level.destroy())
    this.levels = Array.from({ length: BLOOM_LEVELS }, (_, i) => {
      width = Math.max(1, Math.ceil(width / 2))
      height = Math.max(1, Math.ceil(height / 2))
      return this.device.createTexture({
        label: `Bloom ${i}`,
        size: [width, height],
        format: FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    })

    const pass = (slot: number, pipeline: GPURenderPipeline, source: GPUTexture, target: GPUTexture): Pass => ({
      pipeline,
      target: target.createView(),
      additive: pipeline === this.pipelines.upsample,
      bindGroup: this.device.createBindGroup({
        label: `Bloom ${slot}`,
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.buffer, offset: slot * SLOT, size: 32 } },
          { binding: 1, resource: source.createView() },
          { binding: 2, resource: this.sampler },
        ],
      }),
    })
    const { reduce, downsample, upsample } = this.pipelines
    const levels = this.levels
    this.passes = [pass(0, reduce, image, levels[0])]
    for (let i = 1; i < BLOOM_LEVELS; i++) this.passes.push(pass(this.passes.length, downsample, levels[i - 1], levels[i]))
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) this.passes.push(pass(this.passes.length, upsample, levels[i], levels[i - 1]))
  }

  render(encoder: GPUCommandEncoder) {
    // Each pass's texel is its source's; the reduce reads texel by texel and needs none.
    const p = this.params
    const slot = (i: number) => (i * SLOT) / 4
    p[slot(0) + 3] = this.exposure
    p[slot(0) + 4] = this.threshold
    for (let i = 1; i < PASSES; i++) {
      const downsampling = i < BLOOM_LEVELS
      const source = downsampling ? this.levels[i - 1] : this.levels[PASSES - i]
      p[slot(i)] = 1 / source.width
      p[slot(i) + 1] = 1 / source.height
      p[slot(i) + 2] = downsampling ? 1 : this.radius
    }
    this.device.queue.writeBuffer(this.buffer, 0, p)

    for (const { pipeline, target, bindGroup, additive } of this.passes) {
      const pass = encoder.beginRenderPass({
        label: "Bloom",
        colorAttachments: [
          { view: target, loadOp: additive ? "load" : "clear", clearValue: [0, 0, 0, 1], storeOp: "store" },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bindGroup)
      pass.draw(3)
      pass.end()
    }
  }

  dispose() {
    this.levels.forEach((level) => level.destroy())
    this.buffer.destroy()
  }
}
