import { mix, positionWorld, texture, vec3 } from "three/tsl"
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  MeshStandardNodeMaterial,
  RedFormat,
  UnsignedByteType,
} from "three/webgpu"

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

  const depthMap = new DataTexture(data, size, size, RedFormat, UnsignedByteType)
  // Clamping is what keeps the open ocean beyond the island's footprint deep:
  // the heightfield's perimeter is pinned to the seabed, so the edge texels the
  // clamp repeats are already fully deep. No border seam, no extra masking.
  depthMap.wrapS = ClampToEdgeWrapping
  depthMap.wrapT = ClampToEdgeWrapping
  depthMap.minFilter = LinearFilter
  depthMap.magFilter = LinearFilter
  depthMap.needsUpdate = true

  const material = new MeshStandardNodeMaterial({
    roughness: 0.5,
    metalness: 0.05,
  })

  // World position, not the plane's own UVs — the ocean plane is far wider than
  // the terrain, so the lookup has to be in island-footprint space.
  const footprintUv = positionWorld.xz.div(ISLAND_SIZE).add(0.5)
  const shoreDepth = texture(depthMap, footprintUv).r

  material.colorNode = mix(
    vec3(SHALLOW_WATER_COLOR.r, SHALLOW_WATER_COLOR.g, SHALLOW_WATER_COLOR.b),
    vec3(DEEP_WATER_COLOR.r, DEEP_WATER_COLOR.g, DEEP_WATER_COLOR.b),
    shoreDepth,
  )

  return { material, depthMap }
}
