import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js"
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three"

import {
  createIslandGeometry,
  createIslandHeightfield,
  ISLAND_SIZE,
  normalizeIslandResolution,
  type IslandSettings,
} from "./terrain"

export type IslandExportOptions = {
  includeWater: boolean
  includeBiomes: boolean
}

export async function exportIslandGlb(
  settings: IslandSettings,
  options: IslandExportOptions,
) {
  const heightfield = createIslandHeightfield(settings)
  const terrainGeometry = createIslandGeometry(settings, heightfield)
  if (!options.includeBiomes) {
    // glTF has no material-level switch for vertex colors. If COLOR_0 is
    // present, importers multiply it into the material even when Three.js had
    // vertexColors disabled, so neutral exports must omit the attribute.
    terrainGeometry.deleteAttribute("color")
  }
  const oceanGeometry = options.includeWater
    ? new PlaneGeometry(ISLAND_SIZE * 1.08, ISLAND_SIZE * 1.08)
    : null
  oceanGeometry?.rotateX(-Math.PI / 2)
  oceanGeometry?.translate(0, settings.waterLevel, 0)
  const terrainMaterial = new MeshStandardMaterial({
    color: options.includeBiomes ? "#ffffff" : "#c8c0ad",
    vertexColors: options.includeBiomes,
    flatShading: true,
    roughness: 0.94,
    metalness: 0,
  })
  const oceanMaterial = oceanGeometry
    ? new MeshStandardMaterial({
        color: "#318be0",
        roughness: 0.5,
        metalness: 0.05,
      })
    : null
  const terrain = new Mesh(terrainGeometry, terrainMaterial)
  const island = new Group()

  island.name = `island-${settings.seed}`
  terrain.name = "terrain"
  island.add(terrain)

  if (oceanGeometry && oceanMaterial) {
    const ocean = new Mesh(oceanGeometry, oceanMaterial)
    ocean.name = "ocean"
    island.add(ocean)
  }

  try {
    const result = await new GLTFExporter().parseAsync(island, {
      binary: true,
      forceIndices: true,
      onlyVisible: true,
    })

    if (!(result instanceof ArrayBuffer)) {
      throw new Error("GLB export did not produce binary data")
    }

    const downloadUrl = URL.createObjectURL(
      new Blob([result], { type: "model/gltf-binary" }),
    )
    const link = document.createElement("a")
    link.href = downloadUrl
    const waterLabel = options.includeWater ? "water" : "dry"
    const biomeLabel = options.includeBiomes ? "biomes" : "neutral"
    const resolution = normalizeIslandResolution(settings.resolution)
    link.download =
      `island-${settings.seed}-${waterLabel}-${biomeLabel}-` +
      `${resolution}x${resolution}-shore${Math.round((settings.shoreSoftness ?? 0) * 100)}-` +
      `smooth${Math.round((settings.smoothing ?? 0) * 100)}.glb`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
  } finally {
    terrainGeometry.dispose()
    oceanGeometry?.dispose()
    terrainMaterial.dispose()
    oceanMaterial?.dispose()
  }
}
