export type ExperimentStatus = "live" | "wip" | "archived"

export type Experiment = {
  href: string
  title: string
  description: string
  /** Category the experiment belongs to; must match an entry in EXPERIMENT_GROUPS. */
  group: string
  status: ExperimentStatus
  /** Libraries and languages the experiment is actually built on, shown as row
   *  tags. Sourced from each experiment's imports, not from memory. */
  tech: string[]
  keywords?: string[]
}

/** Group display order on the index. */
export const EXPERIMENT_GROUPS = [
  "3D & Spatial",
  "Generative & Visual",
  "Glass & Refraction",
  "Play",
] as const

/** Newest first. There are no dates, so the index's date sort is this order. */
export const EXPERIMENTS: Experiment[] = [
  {
    href: "/experiments/phosphor",
    title: "Phosphor",
    description:
      "Soft blocks of colour, crisp in one place and smeared in the next, ghosted like a video starved of bitrate and seen through a CRT's slot mask. Click for a new frame, R to roll the dice on every setting, S to save it at 4K.",
    group: "Generative & Visual",
    status: "wip",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: [
      "crt",
      "slot mask",
      "aperture grille",
      "phosphor",
      "scanlines",
      "grain",
      "glitch",
      "compression",
      "codec",
      "macroblocks",
      "ghosting",
      "color field",
      "blocks",
      "abstract",
      "generative",
      "oklch",
      "palette",
      "png",
    ],
  },
  {
    href: "/experiments/global-illumination",
    title: "Global Illumination",
    description:
      "A concrete box in the sky: sun shafts through one window, lit a second time by its own bounce light — one blue-noise ray a pixel, averaged frame over frame until the grain settles. Orbit in and out through the walls.",
    group: "3D & Spatial",
    status: "wip",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: [
      "global illumination",
      "gi",
      "bounce",
      "indirect light",
      "raymarch",
      "sdf",
      "blue noise",
      "accumulation",
      "path tracing",
      "emissive",
      "soft shadows",
      "volumetric",
      "god rays",
      "bloom",
      "aces",
      "orbit",
    ],
  },
  {
    href: "/experiments/hand",
    title: "Hand",
    description:
      "A sculpted hand in grainy black and white, fingers rolling in a seamless loop. Bring the cursor into its grasp and the hand catches it.",
    group: "3D & Spatial",
    status: "wip",
    tech: ["Three.js", "R3F", "GLSL", "glTF"],
    keywords: ["hand", "fingers", "loop", "black and white", "monochrome", "film grain", "skinned", "rig", "sculpture", "cursor", "grab", "marble", "depth"],
  },
  {
    href: "/experiments/endless-scroll",
    title: "Endless Scroll",
    description:
      "An endless vertical list of names — fast, smooth scrolling and paired background and preview colors that crossfade on hover.",
    group: "Generative & Visual",
    status: "live",
    tech: ["React", "CSS", "Lenis"],
    keywords: ["endless", "infinite", "scroll", "names", "color", "hover", "typography"],
  },
  {
    href: "/experiments/ghost",
    title: "Ghost",
    description:
      "A quietly waiting sheet ghost — simulated cloth, wandering idle motion, and a gaze that notices you in the dark.",
    group: "3D & Spatial",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["ghost", "cloth", "simulation", "fabric", "spotlight", "idle", "mouse", "gaze"],
  },
  {
    href: "/experiments/decal-pole",
    title: "Decal Pole",
    description:
      "Staple images to a telephone pole — drop one anywhere and it sticks where it lands, a few degrees off true.",
    group: "Play",
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
    status: "wip",
    tech: ["Three.js", "R3F", "WebGL"],
    keywords: ["island", "terrain", "generator", "noise", "seed", "procedural", "low poly"],
  },
  {
    href: "/experiments/frosted-glass",
    title: "Frosted Glass",
    description:
      "Capsules and beads pile up against a pane — depth is spent as blur, so the far ones smear into the fog.",
    group: "Glass & Refraction",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "box3d.js", "lil-gui"],
    keywords: [
      "frosted",
      "glass",
      "fog",
      "blur",
      "depth of field",
      "physics",
      "box3d",
      "capsule",
      "sdf",
      "falloff",
    ],
  },
  {
    href: "/experiments/frog-hop",
    title: "Frog Ace",
    description:
      "Read the wind, pull back, and spring a tiny frog across a branching lily-pad course.",
    group: "Play",
    status: "wip",
    tech: ["Three.js", "R3F", "GLSL", "FBX"],
    keywords: ["frog", "game", "lily pad", "three", "aim", "jump", "wind", "golf"],
  },
  {
    href: "/experiments/aurora",
    title: "Aurora",
    description:
      "Raymarched aurora curtains after kishimisu — spectral ribbons that drift and fold in deep space, pulsing to a generated beat.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "Web Audio", "lil-gui"],
    keywords: ["aurora", "raymarch", "kishimisu", "shader", "space", "spectral", "beat", "music", "synth"],
  },
  {
    href: "/experiments/gradient-flow",
    title: "Gradient Flow",
    description:
      "Living gradients that cross-fade curated palettes, blended in OKLab for natural color.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "thi.ng", "lil-gui"],
    keywords: ["gradient", "color", "palette", "oklab", "natural", "mesh", "shader", "thi.ng"],
  },
  {
    href: "/experiments/glass-grid",
    title: "Fluted Glass",
    description:
      "A pane of segmented log-compression flutes over the left half of a soft drifting wash. The cursor sits behind the glass.",
    group: "Glass & Refraction",
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
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "cross", "lines", "wave", "black and white", "refraction", "shader"],
  },
  {
    href: "/experiments/glass-lines",
    title: "Glass Lines",
    description: "Refracted line-field glass lighting. The lines bend away from the pointer and spring back.",
    group: "Glass & Refraction",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "lines", "refraction", "samuel yan", "shader", "interactive", "pointer", "repel"],
  },
  {
    href: "/experiments/glass-point",
    title: "Glass Point",
    description:
      "A 5×3 grid of point lenses refracting a flowing cosine wash background. They shy away from the pointer and spring back.",
    group: "Glass & Refraction",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "point", "gradient", "lens", "refraction", "shader", "interactive", "pointer", "repel"],
  },
  {
    href: "/experiments/glass-waves",
    title: "Glass Waves",
    description: "Straight vertical glass lines refracting a gold cosine palette. The strips under the pointer grow wider.",
    group: "Glass & Refraction",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "lines", "gold", "palette", "refraction", "shader", "interactive", "pointer"],
  },
  {
    href: "/experiments/reading-glass",
    title: "Reading Glass",
    description:
      "A fixed strip of bent glass near the top refracts the article text with chromatic aberration as you scroll.",
    group: "Glass & Refraction",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["glass", "refraction", "aberration", "text", "scroll", "lens", "backdrop-filter", "svg"],
  },
  {
    href: "/experiments/ps2-intro",
    title: "PS2 Intro",
    description:
      "Concrete column field, refracting glass cubes, and whirling colored light trails over base fog.",
    group: "3D & Spatial",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "Postprocessing"],
    keywords: ["ps2", "playstation", "intro", "glass", "fog", "three", "lights"],
  },
  {
    href: "/experiments/unbreaking-waves",
    title: "Unbreaking Waves",
    description: "Five orbiting petal blobs with palette flow and soft fog wash.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["waves", "petals", "palette", "blobs", "shader"],
  },
  {
    href: "/experiments/warped-stripes",
    title: "Warped Stripes",
    description: "Noise-warped diagonal stripes with live-tweakable colors and warp.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["stripes", "warp", "noise", "diagonal", "shader"],
  },
  {
    href: "/experiments/palm-leaf",
    title: "Palm Leaf",
    description: "Tropical light filtering through large fronds.",
    group: "3D & Spatial",
    status: "live",
    tech: ["Three.js", "R3F"],
    keywords: ["palm", "leaf", "frond", "procedural"],
  },
  {
    href: "/experiments/rectangle-farm",
    title: "Rectangle Farm",
    description: "Rotating physical blocks in a neat field layout.",
    group: "3D & Spatial",
    status: "live",
    tech: ["Three.js", "R3F"],
    keywords: ["rectangle", "farm", "grid", "three", "physics"],
  },
  {
    href: "/experiments/sky",
    title: "Sky Atmosphere",
    description: "Procedural sky gradients and atmospheric depth.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL", "lil-gui"],
    keywords: ["sky", "atmosphere", "sun", "shader"],
  },
  {
    href: "/experiments/gradient",
    title: "Black Ink",
    description: "A slow monochrome ink wash shaped by layered noise.",
    group: "Generative & Visual",
    status: "live",
    tech: ["Three.js", "R3F", "GLSL"],
    keywords: ["black ink", "monochrome", "ink wash", "noise", "shader"],
  },
  {
    href: "/experiments/wormhole",
    title: "Wormhole",
    description: "Shader tunnel with a deep-space motion feel.",
    group: "Generative & Visual",
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
