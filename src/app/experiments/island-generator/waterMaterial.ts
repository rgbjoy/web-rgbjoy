import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
} from "three"

import {
  createShorelineDepthMap,
  ISLAND_SIZE,
  type IslandHeightfield,
  type IslandSettings,
} from "./terrain"

/* Constructing from hex converts sRGB to linear, matching what the standard
   material's `color` prop did before the ramp replaced it. */
const SHALLOW_WATER_COLOR = new Color("#70cef2")
const DEEP_WATER_COLOR = new Color("#318be0")
export const PREVIEW_OCEAN_SIZE = ISLAND_SIZE * 3.4

/**
 * The ocean plane, coloured by how deep the seabed sits beneath it. The shore
 * ramp is sampled from a texture rather than built as geometry, so the shallows
 * are limited by the heightfield's own resolution instead of snapping to whole
 * grid cells the way a per-cell quad mesh does.
 *
 * Caller owns both returned objects and must dispose them.
 */
export function createWaterMaterial(
  settings: IslandSettings,
  heightfield: IslandHeightfield,
) {
  const { size, data } = createShorelineDepthMap(settings, heightfield)

  // Bake the same linear-color mix into a regular map so WebGL needs no node
  // material or custom shader. Bilinear filtering keeps the coastline smooth.
  const colors = new Uint8Array(size * size * 4)
  for (let index = 0; index < data.length; index += 1) {
    const depth = data[index] / 255
    colors[index * 4] = Math.round((SHALLOW_WATER_COLOR.r + (DEEP_WATER_COLOR.r - SHALLOW_WATER_COLOR.r) * depth) * 255)
    colors[index * 4 + 1] = Math.round((SHALLOW_WATER_COLOR.g + (DEEP_WATER_COLOR.g - SHALLOW_WATER_COLOR.g) * depth) * 255)
    colors[index * 4 + 2] = Math.round((SHALLOW_WATER_COLOR.b + (DEEP_WATER_COLOR.b - SHALLOW_WATER_COLOR.b) * depth) * 255)
    colors[index * 4 + 3] = 255
  }
  const colorMap = new DataTexture(colors, size, size, RGBAFormat, UnsignedByteType)
  colorMap.colorSpace = LinearSRGBColorSpace
  // Clamping is what keeps the open ocean beyond the island's footprint deep:
  // the heightfield's perimeter is pinned to the seabed, so the edge texels the
  // clamp repeats are already fully deep. No border seam, no extra masking.
  colorMap.wrapS = ClampToEdgeWrapping
  colorMap.wrapT = ClampToEdgeWrapping
  colorMap.minFilter = LinearFilter
  colorMap.magFilter = LinearFilter
  colorMap.needsUpdate = true

  // Match the old world-space lookup (world.xz / ISLAND_SIZE + 0.5).
  // Rotating PlaneGeometry flat reverses V relative to world Z. Scale its UVs
  // to the island footprint, not the much wider ocean, and clamp beyond it.
  const scale = PREVIEW_OCEAN_SIZE / ISLAND_SIZE
  colorMap.repeat.set(scale, -scale)
  colorMap.offset.set((1 - scale) / 2, (1 + scale) / 2)
  colorMap.updateMatrix()

  const material = new MeshStandardMaterial({
    map: colorMap,
    roughness: 0.5,
    metalness: 0.05,
  })

  return { material, colorMap }
}
