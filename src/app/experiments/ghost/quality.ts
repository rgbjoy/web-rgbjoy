export type GhostQuality = 'desktop' | 'mobile'

export const GHOST_QUALITY = {
  desktop: {
    dpr: 1.25,
    shadowSize: 1024,
    fogSlices: 3,
    fogSegments: [16, 12],
    noiseSize: 256,
    cloth: { segments: 64, capRows: 16, skirtRows: 30, step: 1 / 90, iterations: 5 },
  },
  mobile: {
    dpr: 1,
    shadowSize: 512,
    fogSlices: 2,
    fogSegments: [8, 6],
    noiseSize: 128,
    cloth: { segments: 32, capRows: 12, skirtRows: 22, step: 1 / 60, iterations: 4 },
  },
} as const
