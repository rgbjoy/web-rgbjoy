export type ExperimentStatus = "live" | "wip" | "archived"

export type Experiment = {
  href: string
  title: string
  description: string
  /** Category the experiment belongs to; must match an entry in EXPERIMENT_GROUPS. */
  group: string
  /** Month the experiment first landed, as YYYY-MM (sourced from git history). */
  date: string
  status: ExperimentStatus
  /** Libraries and languages the experiment is actually built on, shown as row
   *  tags. Sourced from each experiment's imports, not from memory. */
  tech: string[]
  keywords?: string[]
}

/** Group display order on the index. */
export const EXPERIMENT_GROUPS = [
  "Play",
  "Generative & Visual",
  "Glass & Refraction",
  "3D & Spatial",
] as const

export const EXPERIMENTS: Experiment[] = [
  {
    href: "/experiments/aurora",
    title: "Aurora",
    description:
      "Raymarched aurora curtains after kishimisu — spectral ribbons that drift and fold in deep space.",
    group: "Generative & Visual",
    date: "2026-07",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["aurora", "raymarch", "kishimisu", "shader", "space", "spectral"],
  },
  {
    href: "/experiments/gradient",
    title: "Background Gradient",
    description: "Shader-led gradient exploration.",
    group: "Generative & Visual",
    date: "2026-03",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["gradient", "background", "color", "shader"],
  },
  {
    href: "/experiments/frog-hop",
    title: "Frog Ace",
    description:
      "Read the wind, pull back, and spring a tiny frog across a branching lily-pad course.",
    group: "Play",
    date: "2026-08",
    status: "wip",
    tech: ["Three.js", "R3F", "GLSL", "FBX"],
    keywords: ["frog", "game", "lily pad", "three", "aim", "jump", "wind", "golf"],
  },
  {
    href: "/experiments/decal-pole",
    title: "Decal Pole",
    description:
      "Staple images to a telephone pole — drop one anywhere and it sticks where it lands, a few degrees off true.",
    group: "Play",
    date: "2026-09",
    status: "live",
    tech: ["Three.js", "R3F", "drei"],
    keywords: [
      "decal",
      "pole",
      "flyer",
      "poster",
      "drag and drop",
      "raycast",
      "projection",
      "telephone pole",
    ],
  },
  {
    href: "/experiments/island-generator",
    title: "Island Generator",
    description:
      "Shape a low-poly island with seeded noise, elevation bands, and live terrain controls.",
    group: "Play",
    date: "2026-09",
    status: "wip",
    tech: ["Three.js", "R3F", "WebGPU"],
    keywords: ["island", "terrain", "generator", "noise", "seed", "procedural", "low poly"],
  },
  {
    href: "/experiments/glass-grid",
    title: "Fluted Glass",
    description:
      "Segmented log-compression flutes over a soft drifting cool-color wash.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "fluted", "wash", "cool drift", "refraction", "shader"],
  },
  {
    href: "/experiments/glass-cross",
    title: "Glass Cross",
    description:
      "A vertical glass line warping thin black wavy lines on white.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "cross", "lines", "wave", "black and white", "refraction", "shader"],
  },
  {
    href: "/experiments/glass-lines",
    title: "Glass Lines",
    description: "Refracted line-field glass lighting.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "lines", "refraction", "samuel yan", "shader"],
  },
  {
    href: "/experiments/glass-point",
    title: "Glass Point",
    description:
      "A 5×3 grid of point lenses refracting a flowing cosine wash background.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "point", "gradient", "lens", "refraction", "shader"],
  },
  {
    href: "/experiments/glass-waves",
    title: "Glass Waves",
    description: "Straight vertical glass lines refracting a gold cosine palette.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "lines", "gold", "palette", "refraction", "shader"],
  },
  {
    href: "/experiments/reading-glass",
    title: "Reading Glass",
    description:
      "A fixed strip of bent glass near the top refracts the article text with chromatic aberration as you scroll.",
    group: "Glass & Refraction",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "refraction", "aberration", "text", "scroll", "lens", "backdrop-filter", "svg"],
  },
  {
    href: "/experiments/gradient-flow",
    title: "Gradient Flow",
    description:
      "Living gradients that cross-fade curated palettes, blended in OKLab for natural color.",
    group: "Generative & Visual",
    date: "2026-07",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "thi.ng", "lil-gui"],
    keywords: ["gradient", "color", "palette", "oklab", "natural", "mesh", "shader", "thi.ng"],
  },
  {
    href: "/experiments/moon-waves",
    title: "Moon Waves",
    description: "Lunar-toned atmospheric wave study.",
    group: "Generative & Visual",
    date: "2026-03",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["moon", "waves", "water", "shader"],
  },
  {
    href: "/experiments/palm-leaf",
    title: "Palm Leaf",
    description: "Tropical light filtering through large fronds.",
    group: "3D & Spatial",
    date: "2026-04",
    status: "live",
    tech: ["Three.js", "R3F"],
    keywords: ["palm", "leaf", "frond", "procedural"],
  },
  {
    href: "/experiments/ps2-intro",
    title: "PS2 Intro",
    description:
      "Concrete column field, refracting glass cubes, and whirling colored light trails over base fog.",
    group: "3D & Spatial",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "Postprocessing"],
    keywords: ["ps2", "playstation", "intro", "glass", "fog", "three", "lights"],
  },
  {
    href: "/experiments/rectangle-farm",
    title: "Rectangle Farm",
    description: "Rotating physical blocks in a neat field layout.",
    group: "3D & Spatial",
    date: "2026-04",
    status: "live",
    tech: ["Three.js", "R3F"],
    keywords: ["rectangle", "farm", "grid", "three", "physics"],
  },
  {
    href: "/experiments/sky",
    title: "Sky Atmosphere",
    description: "Procedural sky gradients and atmospheric depth.",
    group: "Generative & Visual",
    date: "2026-04",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["sky", "atmosphere", "sun", "shader"],
  },
  {
    href: "/experiments/space-road",
    title: "Space Road",
    description:
      "2001-inspired octagonal corridor with long dark wall panels and forward drift.",
    group: "3D & Spatial",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "Postprocessing"],
    keywords: ["space", "road", "2001", "tunnel", "octagon", "three", "odyssey"],
  },
  {
    href: "/experiments/unbreaking-waves",
    title: "Unbreaking Waves",
    description: "Five orbiting petal blobs with palette flow and soft fog wash.",
    group: "Generative & Visual",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["waves", "petals", "palette", "blobs", "shader"],
  },
  {
    href: "/experiments/warped-stripes",
    title: "Warped Stripes",
    description: "Noise-warped diagonal stripes with live-tweakable colors and warp.",
    group: "Generative & Visual",
    date: "2026-06",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["stripes", "warp", "noise", "diagonal", "shader"],
  },
  {
    href: "/experiments/wormhole",
    title: "Wormhole",
    description: "Shader tunnel with a deep-space motion feel.",
    group: "Generative & Visual",
    date: "2026-03",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["wormhole", "tunnel", "shader", "raymarch"],
  },
]

export function experimentSearchText(experiment: Experiment): string {
  return [
    experiment.title,
    experiment.description,
    experiment.href,
    experiment.group,
    ...experiment.tech,
    ...(experiment.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase()
}
