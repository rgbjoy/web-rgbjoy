import { BLUE_NOISE_SIZE, blueNoiseRGBA } from "./blueNoise"
import { PROBE_COUNT } from "./probes"
import { Bloom, BLOOM_LEVELS } from "./bloom"
import denoiseSource from "./denoise.wgsl"
import displaySource from "./display.wgsl"
import frameSource from "./frame.wgsl"
import { FrameUniforms, PROBE_STRIDE, ProbeUpdateUniforms, SceneUniforms, wgslConstants } from "./layout"
import pathsSource from "./paths.wgsl"
import probeSource from "./probe.wgsl"
import sceneSource from "./scene.wgsl"
import traceSource from "./trace.wgsl"

/**
 * Every GPU resource and pass behind the picture, and the order they run in:
 *
 *   probes A ─probe update─> probes B            (one workgroup per probe)
 *   probes B + history A ─trace─> history B      (one invocation per pixel)
 *   history B ─variance─> D0 + geometry ─à-trous─> D1 ─> D0 … D1   (the bounce, denoised)
 *   history B + D1 ─composite─> image ─bloom─> glow
 *   image + glow ─display─> canvas
 *
 * then the same with A and B swapped. Anything one pass reads of the last
 * frame while it writes this one lives twice.
 */

/** Per pixel: bounce light and sample count, direct light and depth, surface colour, air. */
const HISTORY = ["bounce", "direct", "albedo", "air"] as const
const IMAGE_FORMAT: GPUTextureFormat = "rgba16float"
/** Float keeps a long running mean exact; 1/512 of a difference vanishes in half floats. */
const HISTORY_FORMAT: GPUTextureFormat = "rgba32float"
const TILE = 8
/** The denoiser's rounds, each reading the last one's result. */
const DENOISE_ROUNDS = 5
const DENOISE_FORMAT: GPUTextureFormat = "rgba16float"
/** Positions to a fraction of a millimetre, and a packed normal that only a full float holds exactly. */
const GEOMETRY_FORMAT: GPUTextureFormat = "rgba32float"
/** Uniform offsets must fall on 256 bytes. */
const SLOT = 256

// The surface's own light plus what it bounces back, seen through the air,
// plus the light the air adds on the way.
const compositeSource = /* wgsl */ `
  @group(0) @binding(0) var bounce: texture_2d<f32>;
  @group(0) @binding(1) var direct: texture_2d<f32>;
  @group(0) @binding(2) var albedo: texture_2d<f32>;
  @group(0) @binding(3) var air: texture_2d<f32>;
  @group(0) @binding(4) var image: texture_storage_2d<${IMAGE_FORMAT}, write>;

  @compute @workgroup_size(${TILE}, ${TILE})
  fn main(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(image))) { return; }
    let pixel = vec2i(id.xy);
    let surface = textureLoad(direct, pixel, 0).rgb
      + textureLoad(albedo, pixel, 0).rgb * textureLoad(bounce, pixel, 0).rgb;
    let seen = textureLoad(air, pixel, 0);
    textureStore(image, pixel, vec4f(surface * seen.a + seen.rgb, 1.0));
  }
`

/** Compiles a module and passes on whatever the compiler said about it. */
async function compile(device: GPUDevice, label: string, code: string) {
  const shaderModule = device.createShaderModule({ label, code })
  const info = await shaderModule.getCompilationInfo()
  for (const message of info.messages) {
    const where = `${label}:${message.lineNum}:${message.linePos}`
    if (message.type === "error") console.error(`${where} ${message.message}`)
    else if (message.type === "warning") console.warn(`${where} ${message.message}`)
  }
  return shaderModule
}

/** Bind group layout entries are mostly the same few shapes. */
const uniform = (binding: number, visibility: number): GPUBindGroupLayoutEntry => ({
  binding,
  visibility,
  buffer: { type: "uniform" },
})
const sampled = (binding: number, visibility: number, sampleType: GPUTextureSampleType): GPUBindGroupLayoutEntry => ({
  binding,
  visibility,
  texture: { sampleType },
})
const writes = (binding: number, format: GPUTextureFormat): GPUBindGroupLayoutEntry => ({
  binding,
  visibility: GPUShaderStage.COMPUTE,
  storageTexture: { access: "write-only", format },
})

function createLayouts(device: GPUDevice) {
  const { COMPUTE, FRAGMENT } = GPUShaderStage
  return {
    // The scene and last update's probes: shared by the trace and the probe update.
    scene: device.createBindGroupLayout({
      label: "Scene",
      entries: [uniform(0, COMPUTE), { binding: 1, visibility: COMPUTE, buffer: { type: "read-only-storage" } }],
    }),
    probe: device.createBindGroupLayout({
      label: "Probe update",
      entries: [uniform(0, COMPUTE), { binding: 1, visibility: COMPUTE, buffer: { type: "storage" } }],
    }),
    trace: device.createBindGroupLayout({
      label: "Trace",
      entries: [
        uniform(0, COMPUTE),
        sampled(1, COMPUTE, "float"),
        ...HISTORY.map((_, i) => sampled(2 + i, COMPUTE, "unfilterable-float")),
        ...HISTORY.map((_, i) => writes(6 + i, HISTORY_FORMAT)),
        // Last frame's denoised bounce, for the chrome's reflections.
        sampled(10, COMPUTE, "unfilterable-float"),
      ],
    }),
    // The trace's bounce, direct (for depth) and albedo (for normals), in;
    // the bounce with its variance, and each pixel's position and normal, out.
    variance: device.createBindGroupLayout({
      label: "Denoise variance",
      entries: [
        uniform(0, COMPUTE),
        ...[1, 2, 3].map((binding) => sampled(binding, COMPUTE, "unfilterable-float")),
        writes(4, DENOISE_FORMAT),
        writes(5, GEOMETRY_FORMAT),
      ],
    }),
    // The camera, the round, the trace's sample counts, the last round and the geometry, in.
    atrous: device.createBindGroupLayout({
      label: "Denoise round",
      entries: [
        uniform(0, COMPUTE),
        uniform(10, COMPUTE),
        ...[11, 12, 13].map((binding) => sampled(binding, COMPUTE, "unfilterable-float")),
        writes(14, DENOISE_FORMAT),
      ],
    }),
    composite: device.createBindGroupLayout({
      label: "Composite",
      entries: [...HISTORY.map((_, i) => sampled(i, COMPUTE, "unfilterable-float")), writes(4, IMAGE_FORMAT)],
    }),
    display: device.createBindGroupLayout({
      label: "Display",
      entries: [
        uniform(0, FRAGMENT),
        sampled(1, FRAGMENT, "unfilterable-float"),
        sampled(2, FRAGMENT, "float"),
        { binding: 3, visibility: FRAGMENT, sampler: { type: "filtering" } },
      ],
    }),
  }
}

type Layouts = ReturnType<typeof createLayouts>

type Pipelines = {
  probe: GPUComputePipeline
  trace: GPUComputePipeline
  variance: GPUComputePipeline
  atrous: GPUComputePipeline
  composite: GPUComputePipeline
  display: GPURenderPipeline
}

/** GPU time per pass group, in milliseconds; null where it didn't run in the frame measured. */
export type Timings = { probes: number | null; trace: number | null; denoise: number | null; post: number | null }

const TIMED = ["probes", "trace", "denoise", "post"] as const

/**
 * Timestamp queries around each group of passes, read back a frame or so
 * late. Optional: not every adapter offers them.
 */
class GpuTimer {
  private readonly querySet: GPUQuerySet
  private readonly resolve: GPUBuffer
  private readonly read: GPUBuffer
  private readonly ran = TIMED.map(() => false)
  private mapping = false

  constructor(
    device: GPUDevice,
    private readonly onTimings: (timings: Timings) => void,
  ) {
    const count = TIMED.length * 2
    this.querySet = device.createQuerySet({ label: "Pass timings", type: "timestamp", count })
    this.resolve = device.createBuffer({
      label: "Pass timings resolve",
      size: count * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    })
    this.read = device.createBuffer({
      label: "Pass timings read",
      size: count * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
  }

  /** Marks a pass group as run this frame and stamps its start, its end, or both. */
  stamp(group: number, edges: { begin?: boolean; end?: boolean }) {
    this.ran[group] = true
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: edges.begin ? group * 2 : undefined,
      endOfPassWriteIndex: edges.end ? group * 2 + 1 : undefined,
    }
  }

  /** Copies this frame's stamps out, unless the last ones are still being read. */
  finish(encoder: GPUCommandEncoder) {
    if (this.mapping) return false
    encoder.resolveQuerySet(this.querySet, 0, TIMED.length * 2, this.resolve, 0)
    encoder.copyBufferToBuffer(this.resolve, 0, this.read, 0, this.read.size)
    return true
  }

  /** After the submit: reads the stamps back and reports them. */
  collect() {
    const ran = this.ran.slice()
    this.ran.fill(false)
    this.mapping = true
    this.read
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const stamps = new BigUint64Array(this.read.getMappedRange())
        const ms = (group: number) => {
          if (!ran[group]) return null
          const ns = Number(stamps[group * 2 + 1] - stamps[group * 2])
          return Math.max(ns, 0) / 1e6
        }
        const timings = { probes: ms(0), trace: ms(1), denoise: ms(2), post: ms(3) }
        this.read.unmap()
        this.onTimings(timings)
      })
      // Destroyed mid-read on teardown; nothing to report.
      .catch(() => {})
      .finally(() => {
        this.mapping = false
      })
  }

  /** Forgets the stamps of a frame that copied none out. */
  skip() {
    this.ran.fill(false)
  }

  dispose() {
    this.querySet.destroy()
    this.resolve.destroy()
    this.read.destroy()
  }
}

/** What one frame should do; everything else it needs is in the uniforms. */
export type FrameWork = {
  /** Run a probe update, with `probeUpdate` as it stands. */
  probes: boolean
  /** Trace the scene into the history, with `frame` as it stands. */
  trace: boolean
  /** Show the bounce light denoised. */
  denoise: boolean
  bloom: number
  exposure: number
}

export class GpuPasses {
  readonly scene = new SceneUniforms()
  readonly frame = new FrameUniforms()
  readonly probeUpdate = new ProbeUpdateUniforms()
  /** Set after changing `scene`; it's uploaded with the next frame. */
  sceneChanged = true
  width = 0
  height = 0

  private readonly context: GPUCanvasContext
  /** Configured on the first frame drawn, so an instance thrown away before then never touches the canvas. */
  private configured = false
  private readonly sceneBuffer: GPUBuffer
  private readonly frameBuffer: GPUBuffer
  private readonly probeUpdateBuffer: GPUBuffer
  private readonly displayBuffer: GPUBuffer
  private readonly displayData = new Float32Array(4)
  /** Which round each denoise pass is, one slot per round. */
  private readonly roundBuffer: GPUBuffer
  private readonly probes: [GPUBuffer, GPUBuffer]
  private readonly blueNoise: GPUTexture
  private readonly sampler: GPUSampler
  /** Scene bind groups reading probes A or B, and probe update groups writing A or B. */
  private readonly sceneGroups: [GPUBindGroup, GPUBindGroup]
  private readonly probeGroups: [GPUBindGroup, GPUBindGroup]
  private readonly timer: GpuTimer | null

  // Sized to the screen, so made again on every resize.
  private history: [GPUTexture[], GPUTexture[]] = [[], []]
  private image: GPUTexture | null = null
  private traceGroups: GPUBindGroup[] = []
  private compositeGroups: GPUBindGroup[] = []
  private displayGroup: GPUBindGroup | null = null
  private denoised: [GPUTexture, GPUTexture] | null = null
  private geometry: GPUTexture | null = null
  /** Per history: the variance pass, then each round. */
  private denoiseGroups: { variance: GPUBindGroup; rounds: GPUBindGroup[] }[] = []
  /** Per history: the composite reading the denoised bounce instead of the raw one. */
  private denoisedCompositeGroups: GPUBindGroup[] = []
  /** Whether the last round's result is of the newest history. */
  private denoiseCurrent = false

  /** Whether any probe update has run, so the probes hold light worth reading. */
  private probesFilled = false
  /** Which of the pair holds the newest probes, and the newest history. */
  private probesNow = 0
  private historyNow = 0

  private constructor(
    private readonly device: GPUDevice,
    private readonly canvas: HTMLCanvasElement,
    private readonly layouts: Layouts,
    private readonly pipelines: Pipelines,
    private readonly bloom: Bloom,
    onTimings: (timings: Timings) => void,
  ) {
    const context = canvas.getContext("webgpu")
    if (!context) throw new Error("Global Illumination: no WebGPU context on the canvas")
    this.context = context

    const uniformBuffer = (label: string, size: number) =>
      device.createBuffer({ label, size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.sceneBuffer = uniformBuffer("Scene", SceneUniforms.SIZE)
    this.frameBuffer = uniformBuffer("Frame", FrameUniforms.SIZE)
    this.probeUpdateBuffer = uniformBuffer("Probe update", ProbeUpdateUniforms.SIZE)
    this.displayBuffer = uniformBuffer("Display", this.displayData.byteLength)
    this.roundBuffer = uniformBuffer("Denoise rounds", DENOISE_ROUNDS * SLOT)
    const rounds = new Uint32Array((DENOISE_ROUNDS * SLOT) / 4)
    for (let i = 0; i < DENOISE_ROUNDS; i++) rounds[(i * SLOT) / 4] = i
    device.queue.writeBuffer(this.roundBuffer, 0, rounds)

    // Zeroed at creation: no probe is usable until the first update says so.
    const probeBuffer = (name: string) =>
      device.createBuffer({ label: `Probes ${name}`, size: PROBE_COUNT * PROBE_STRIDE, usage: GPUBufferUsage.STORAGE })
    this.probes = [probeBuffer("A"), probeBuffer("B")]

    this.blueNoise = device.createTexture({
      label: "Blue noise",
      size: [BLUE_NOISE_SIZE, BLUE_NOISE_SIZE],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    device.queue.writeTexture(
      { texture: this.blueNoise },
      blueNoiseRGBA(BLUE_NOISE_SIZE),
      { bytesPerRow: BLUE_NOISE_SIZE * 4 },
      [BLUE_NOISE_SIZE, BLUE_NOISE_SIZE],
    )
    this.sampler = device.createSampler({ label: "Display", minFilter: "linear", magFilter: "linear" })

    const sceneGroup = (i: number) =>
      device.createBindGroup({
        label: `Scene, probes ${"AB"[i]}`,
        layout: layouts.scene,
        entries: [
          { binding: 0, resource: { buffer: this.sceneBuffer } },
          { binding: 1, resource: { buffer: this.probes[i] } },
        ],
      })
    const probeGroup = (i: number) =>
      device.createBindGroup({
        label: `Probe update into ${"AB"[i]}`,
        layout: layouts.probe,
        entries: [
          { binding: 0, resource: { buffer: this.probeUpdateBuffer } },
          { binding: 1, resource: { buffer: this.probes[i] } },
        ],
      })
    this.sceneGroups = [sceneGroup(0), sceneGroup(1)]
    this.probeGroups = [probeGroup(0), probeGroup(1)]

    this.timer = device.features.has("timestamp-query") ? new GpuTimer(device, onTimings) : null
  }

  /** Compiles every pass (off the main thread where the browser can) and sets up the canvas. */
  static async create(device: GPUDevice, canvas: HTMLCanvasElement, onTimings: (timings: Timings) => void) {
    const layouts = createLayouts(device)
    const scene = `${wgslConstants()}\n${sceneSource}`
    const paths = `${scene}\n${frameSource}\n${pathsSource}`
    const [traceModule, probeModule, denoiseModule, compositeModule, displayModule, bloom] =
      await Promise.all([
        compile(device, "trace.wgsl", `${paths}\n${traceSource}`),
        compile(device, "probe.wgsl", `${scene}\n${probeSource}`),
        compile(device, "denoise.wgsl", `${frameSource}\n${denoiseSource}`),
        compile(device, "composite.wgsl", compositeSource),
        compile(device, "display.wgsl", `const BLOOM_LEVELS = ${BLOOM_LEVELS};\n${displaySource}`),
        Bloom.create(device, (label, code) => compile(device, label, code)),
      ])
    const layout = (label: string, ...groups: GPUBindGroupLayout[]) =>
      device.createPipelineLayout({ label, bindGroupLayouts: groups })
    const [trace, probe, variance, atrous, composite, display] = await Promise.all([
      device.createComputePipelineAsync({
        label: "Trace",
        layout: layout("Trace", layouts.scene, layouts.trace),
        compute: { module: traceModule, entryPoint: "main" },
      }),
      device.createComputePipelineAsync({
        label: "Probe update",
        layout: layout("Probe update", layouts.scene, layouts.probe),
        compute: { module: probeModule, entryPoint: "main" },
      }),
      device.createComputePipelineAsync({
        label: "Denoise variance",
        layout: layout("Denoise variance", layouts.variance),
        compute: { module: denoiseModule, entryPoint: "variance" },
      }),
      device.createComputePipelineAsync({
        label: "Denoise round",
        layout: layout("Denoise round", layouts.atrous),
        compute: { module: denoiseModule, entryPoint: "atrous" },
      }),
      device.createComputePipelineAsync({
        label: "Composite",
        layout: layout("Composite", layouts.composite),
        compute: { module: compositeModule, entryPoint: "main" },
      }),
      device.createRenderPipelineAsync({
        label: "Display",
        layout: layout("Display", layouts.display),
        vertex: { module: displayModule, entryPoint: "fullscreen" },
        fragment: { module: displayModule, entryPoint: "main", targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }] },
      }),
    ])
    return new GpuPasses(
      device,
      canvas,
      layouts,
      { trace, probe, variance, atrous, composite, display },
      bloom,
      onTimings,
    )
  }

  /** Whether the GPU reports its own timings; without them the page judges by its frame rate. */
  get timed() {
    return this.timer !== null
  }

  /** The largest picture the device can hold, per side. */
  get maxSize() {
    return this.device.limits.maxTextureDimension2D
  }

  /** Resizes the canvas and everything drawn at its size. The history starts over, zeroed. */
  setSize(width: number, height: number) {
    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height
    const { device, layouts } = this

    this.history.flat().forEach((texture) => texture.destroy())
    this.image?.destroy()
    this.denoised?.forEach((texture) => texture.destroy())
    this.geometry?.destroy()
    const historyTexture = (name: string, i: number) =>
      device.createTexture({
        label: `History ${name} ${"AB"[i]}`,
        size: [width, height],
        format: HISTORY_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      })
    this.history = [HISTORY.map((name) => historyTexture(name, 0)), HISTORY.map((name) => historyTexture(name, 1))]
    this.historyNow = 0
    const image = device.createTexture({
      label: "Image",
      size: [width, height],
      format: IMAGE_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    })
    this.image = image
    this.bloom.setSize(width, height, image)
    const denoiseTexture = (i: number) =>
      device.createTexture({
        label: `Denoised ${i}`,
        size: [width, height],
        format: DENOISE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      })
    const denoised: [GPUTexture, GPUTexture] = [denoiseTexture(0), denoiseTexture(1)]
    this.denoised = denoised
    const geometry = device.createTexture({
      label: "Denoise geometry",
      size: [width, height],
      format: GEOMETRY_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    })
    this.geometry = geometry
    this.denoiseCurrent = false

    const views = (i: number) => this.history[i].map((texture) => texture.createView())
    // Trace group i reads history i and writes the other.
    this.traceGroups = [0, 1].map((i) => {
      const read = views(i)
      const write = views(1 - i)
      return device.createBindGroup({
        label: `Trace from ${"AB"[i]}`,
        layout: layouts.trace,
        entries: [
          { binding: 0, resource: { buffer: this.frameBuffer } },
          { binding: 1, resource: this.blueNoise.createView() },
          ...read.map((resource, j) => ({ binding: 2 + j, resource })),
          ...write.map((resource, j) => ({ binding: 6 + j, resource })),
          { binding: 10, resource: denoised[1].createView() },
        ],
      })
    })
    this.compositeGroups = [0, 1].map((i) =>
      device.createBindGroup({
        label: `Composite ${"AB"[i]}`,
        layout: layouts.composite,
        entries: [...views(i).map((resource, j) => ({ binding: j, resource })), { binding: 4, resource: image.createView() }],
      }),
    )
    // Five rounds from D0 end in D1, which the composite reads for the bounce.
    this.denoisedCompositeGroups = [0, 1].map((i) =>
      device.createBindGroup({
        label: `Composite ${"AB"[i]}, denoised`,
        layout: layouts.composite,
        entries: [
          { binding: 0, resource: denoised[1].createView() },
          ...views(i)
            .slice(1)
            .map((resource, j) => ({ binding: 1 + j, resource })),
          { binding: 4, resource: image.createView() },
        ],
      }),
    )
    this.denoiseGroups = [0, 1].map((i) => {
      const [bounce, direct, albedo] = views(i)
      const frame = { binding: 0, resource: { buffer: this.frameBuffer } }
      return {
        variance: device.createBindGroup({
          label: `Denoise variance ${"AB"[i]}`,
          layout: layouts.variance,
          entries: [
            frame,
            { binding: 1, resource: bounce },
            { binding: 2, resource: direct },
            { binding: 3, resource: albedo },
            { binding: 4, resource: denoised[0].createView() },
            { binding: 5, resource: geometry.createView() },
          ],
        }),
        rounds: Array.from({ length: DENOISE_ROUNDS }, (_, round) =>
          device.createBindGroup({
            label: `Denoise round ${round} ${"AB"[i]}`,
            layout: layouts.atrous,
            entries: [
              frame,
              { binding: 10, resource: { buffer: this.roundBuffer, offset: round * SLOT, size: 16 } },
              { binding: 11, resource: bounce },
              { binding: 12, resource: denoised[round % 2].createView() },
              { binding: 13, resource: geometry.createView() },
              { binding: 14, resource: denoised[(round + 1) % 2].createView() },
            ],
          }),
        ),
      }
    })
    this.displayGroup = device.createBindGroup({
      label: "Display",
      layout: layouts.display,
      entries: [
        { binding: 0, resource: { buffer: this.displayBuffer } },
        { binding: 1, resource: image.createView() },
        { binding: 2, resource: this.bloom.view },
        { binding: 3, resource: this.sampler },
      ],
    })
  }

  set bloomRadius(value: number) {
    this.bloom.radius = value
  }

  set bloomExposure(value: number) {
    this.bloom.exposure = value
  }

  set bloomThreshold(value: number) {
    this.bloom.threshold = value
  }

  /** Encodes and submits one frame. */
  render(work: FrameWork) {
    const { device, pipelines, timer } = this
    const queue = device.queue
    if (!this.configured) {
      this.context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: "opaque" })
      this.configured = true
    }
    const encoder = device.createCommandEncoder({ label: "Global Illumination frame" })

    if (this.sceneChanged) {
      queue.writeBuffer(this.sceneBuffer, 0, this.scene.pack())
      this.sceneChanged = false
    }

    // The probe volume settles on its own clock, whatever the camera does.
    if (work.probes) {
      queue.writeBuffer(this.probeUpdateBuffer, 0, this.probeUpdate.pack())
      const before = this.probesNow
      const after = 1 - before
      const pass = encoder.beginComputePass({
        label: "Probe update",
        timestampWrites: timer?.stamp(0, { begin: true, end: true }),
      })
      pass.setPipeline(pipelines.probe)
      pass.setBindGroup(0, this.sceneGroups[before])
      pass.setBindGroup(1, this.probeGroups[after])
      pass.dispatchWorkgroups(PROBE_COUNT)
      pass.end()
      this.probesNow = after
      this.probesFilled = true
    }

    if (work.trace) {
      // D1 is only of the history the trace reads if the denoiser ran on it.
      this.frame.smoothHistory = work.denoise && this.denoiseCurrent
      this.frame.probesReady = this.probesFilled
      queue.writeBuffer(this.frameBuffer, 0, this.frame.pack())
      const pass = encoder.beginComputePass({
        label: "Trace",
        timestampWrites: timer?.stamp(1, { begin: true, end: true }),
      })
      pass.setPipeline(pipelines.trace)
      pass.setBindGroup(0, this.sceneGroups[this.probesNow])
      pass.setBindGroup(1, this.traceGroups[this.historyNow])
      pass.dispatchWorkgroups(Math.ceil(this.width / TILE), Math.ceil(this.height / TILE))
      pass.end()
      this.historyNow = 1 - this.historyNow
      this.denoiseCurrent = false
    }

    // Only redone when there's a new history to denoise. One pass, six
    // dispatches: each dispatch sees what the one before it wrote, and one
    // pass is timed at its two ends rather than one stamp per round.
    if (work.denoise && !this.denoiseCurrent) {
      const groups = this.denoiseGroups[this.historyNow]
      const tiles = [Math.ceil(this.width / TILE), Math.ceil(this.height / TILE)] as const
      const pass = encoder.beginComputePass({
        label: "Denoise",
        timestampWrites: timer?.stamp(2, { begin: true, end: true }),
      })
      pass.setPipeline(pipelines.variance)
      pass.setBindGroup(0, groups.variance)
      pass.dispatchWorkgroups(...tiles)
      pass.setPipeline(pipelines.atrous)
      for (const round of groups.rounds) {
        pass.setBindGroup(0, round)
        pass.dispatchWorkgroups(...tiles)
      }
      pass.end()
      this.denoiseCurrent = true
    }

    // Post runs every frame drawn: grading and bloom settings change it
    // without anything being traced again.
    const composite = encoder.beginComputePass({
      label: "Composite",
      timestampWrites: timer?.stamp(3, { begin: true }),
    })
    composite.setPipeline(pipelines.composite)
    composite.setBindGroup(0, (work.denoise ? this.denoisedCompositeGroups : this.compositeGroups)[this.historyNow])
    composite.dispatchWorkgroups(Math.ceil(this.width / TILE), Math.ceil(this.height / TILE))
    composite.end()

    if (work.bloom > 0) this.bloom.render(encoder)

    this.displayData.set([this.width, this.height, work.bloom, work.exposure])
    queue.writeBuffer(this.displayBuffer, 0, this.displayData)
    const display = encoder.beginRenderPass({
      label: "Display",
      colorAttachments: [
        { view: this.context.getCurrentTexture().createView(), loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store" },
      ],
      timestampWrites: timer?.stamp(3, { end: true }),
    })
    display.setPipeline(pipelines.display)
    display.setBindGroup(0, this.displayGroup)
    display.draw(3)
    display.end()

    const timing = timer?.finish(encoder) ?? false
    queue.submit([encoder.finish()])
    if (timing) timer?.collect()
    else timer?.skip()
  }

  dispose() {
    this.timer?.dispose()
    this.bloom.dispose()
    this.history.flat().forEach((texture) => texture.destroy())
    this.image?.destroy()
    this.denoised?.forEach((texture) => texture.destroy())
    this.geometry?.destroy()
    this.probes.forEach((buffer) => buffer.destroy())
    this.blueNoise.destroy()
    ;[this.sceneBuffer, this.frameBuffer, this.probeUpdateBuffer, this.displayBuffer, this.roundBuffer].forEach((buffer) =>
      buffer.destroy(),
    )
    if (this.configured) this.context.unconfigure()
  }
}
