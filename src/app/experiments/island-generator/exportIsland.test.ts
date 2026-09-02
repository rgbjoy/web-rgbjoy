import { expect, spyOn, test } from "bun:test"

import { exportIslandGlb } from "./exportIsland"
import { createIslandGeometry, DEFAULT_ISLAND_SETTINGS } from "./terrain"

// Exercise the real binary exporter; only browser download APIs are stubbed.
class BlobReader {
  result: ArrayBuffer | null = null
  onloadend: (() => void) | null = null

  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result
      this.onloadend?.()
    })
  }
}

function replaceGlobal(name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
}

type GlbJson = {
  nodes: { name: string; mesh?: number }[]
  meshes: { primitives: { attributes: Record<string, number> }[] }[]
  accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number; type: string }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
}

test("GLB contains the softened preview mesh and still respects all water/biome toggle combinations", async () => {
  const downloads: Blob[] = []
  const link = { href: "", download: "", click() {}, remove() {} }
  const restoreGlobals = [
    replaceGlobal("FileReader", BlobReader),
    replaceGlobal("document", { createElement: () => link, body: { append() {} } }),
    replaceGlobal("window", { setTimeout: (callback: () => void) => callback() }),
  ]
  const createUrl = spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    downloads.push(blob as Blob)
    return "blob:island-export-test"
  })
  const revokeUrl = spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const settings = {
    ...DEFAULT_ISLAND_SETTINGS, resolution: 64, shoreSoftness: 0.75,
    smoothing: 0.5, waterLevel: 0.3,
  }
  const previewTerrain = createIslandGeometry(settings)

  try {
    for (const includeWater of [false, true]) {
      for (const includeBiomes of [false, true]) {
        await exportIslandGlb(settings, { includeWater, includeBiomes })
        const binary = await downloads[downloads.length - 1].arrayBuffer()
        const header = new DataView(binary)
        expect(header.getUint32(0, true)).toBe(0x46546c67)
        const jsonLength = header.getUint32(12, true)
        const json: GlbJson = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, jsonLength)))
        const binaryOffset = 20 + jsonLength + 8
        const nodes = json.nodes.filter((node) => node.mesh !== undefined)
        // The shore ramp lives in the water material now, so `includeWater`
        // contributes the ocean plane alone.
        expect(nodes.map((node) => node.name)).toEqual(
          includeWater ? ["terrain", "ocean"] : ["terrain"],
        )

        for (const [name, geometry] of [["terrain", previewTerrain]] as const) {
          const node = nodes.find((item) => item.name === name)!
          const attributes = json.meshes[node.mesh!].primitives[0].attributes
          if (name === "terrain") expect(attributes.COLOR_0 !== undefined).toBe(includeBiomes)
          const accessor = json.accessors[attributes.POSITION]
          const view = json.bufferViews[accessor.bufferView]
          const positions = geometry.getAttribute("position")
          expect(accessor.componentType).toBe(5126) // FLOAT
          expect(accessor.type).toBe("VEC3")
          expect(accessor.count).toBe(positions.count)
          const data = new DataView(binary)
          const start = binaryOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
          for (let vertex = 0; vertex < accessor.count; vertex += 1) {
            const offset = start + vertex * (view.byteStride ?? 12)
            expect(data.getFloat32(offset, true)).toBe(positions.getX(vertex))
            expect(data.getFloat32(offset + 4, true)).toBe(positions.getY(vertex))
            expect(data.getFloat32(offset + 8, true)).toBe(positions.getZ(vertex))
          }
        }
        expect(link.download).toContain("-shore75-smooth50.glb")
        expect(link.download).toContain(includeWater ? "-water-" : "-dry-")
        expect(link.download).toContain(includeBiomes ? "-biomes-" : "-neutral-")
      }
    }
  } finally {
    previewTerrain.dispose()
    createUrl.mockRestore()
    revokeUrl.mockRestore()
    for (const restore of restoreGlobals.reverse()) restore()
  }
})
