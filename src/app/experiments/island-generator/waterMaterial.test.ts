import { describe, expect, test } from "bun:test"
import {
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  LinearSRGBColorSpace,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from "three"

import {
  createIslandHeightfield,
  createShorelineDepthMap,
  DEFAULT_ISLAND_SETTINGS,
  ISLAND_SIZE,
  type IslandHeightfield,
} from "./terrain"
import { createWaterMaterial, PREVIEW_OCEAN_SIZE } from "./waterMaterial"

describe("WebGL island water", () => {
  test("uses a standard WebGL-compatible lit material", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64 }
    const { material, colorMap } = createWaterMaterial(settings, createIslandHeightfield(settings))
    try {
      expect(material).toBeInstanceOf(MeshStandardMaterial)
      expect("isNodeMaterial" in material).toBe(false)
      expect(material.map).toBe(colorMap)
      expect(material.color.getHexString()).toBe("ffffff")
      expect(material.fog).toBe(true)
      expect(material.roughness).toBe(0.5)
      expect(material.metalness).toBe(0.05)
      expect(colorMap.format).toBe(RGBAFormat)
      expect(colorMap.type).toBe(UnsignedByteType)
      expect(colorMap.colorSpace).toBe(LinearSRGBColorSpace)
      expect(colorMap.minFilter).toBe(LinearFilter)
      expect(colorMap.magFilter).toBe(LinearFilter)
      expect(colorMap.wrapS).toBe(ClampToEdgeWrapping)
      expect(colorMap.wrapT).toBe(ClampToEdgeWrapping)
      expect(colorMap.flipY).toBe(false)
    } finally {
      material.dispose()
      colorMap.dispose()
    }
  })

  test("bakes the previous shallow/deep linear color blend for every depth texel", () => {
    const field: IslandHeightfield = {
      gridSegments: 2,
      heights: new Float32Array([-2, -0.72, -0.36, -0.1, 0, 0.2, -0.55, -0.25, 3]),
    }
    const shallow = new Color("#70cef2")
    const deep = new Color("#318be0")
    for (const waterLevel of [-0.1, 0, 1.5]) {
      const settings = { ...DEFAULT_ISLAND_SETTINGS, waterLevel }
      const { material, colorMap } = createWaterMaterial(settings, field)
      try {
        const depths = createShorelineDepthMap(settings, field)
        const pixels = colorMap.image.data
        if (!pixels) throw new Error("Water texture is missing its pixel data")
        expect(colorMap.image.width).toBe(depths.size)
        expect(colorMap.image.height).toBe(depths.size)
        for (let index = 0; index < depths.data.length; index += 1) {
          const expected = shallow.clone().lerp(deep, depths.data[index] / 255)
          for (const [channel, value] of [expected.r, expected.g, expected.b].entries()) {
            expect(Math.abs(pixels[index * 4 + channel] / 255 - value)).toBeLessThanOrEqual(0.5 / 255)
          }
          expect(pixels[index * 4 + 3]).toBe(255)
        }
      } finally {
        material.dispose()
        colorMap.dispose()
      }
    }
  })

  test("texture coordinates match world X/Z on the rotated ocean and clamp outside the island", () => {
    const settings = { ...DEFAULT_ISLAND_SETTINGS, resolution: 64 }
    const { material, colorMap } = createWaterMaterial(settings, createIslandHeightfield(settings))
    const plane = new PlaneGeometry(PREVIEW_OCEAN_SIZE, PREVIEW_OCEAN_SIZE, 8, 8)
    plane.rotateX(-Math.PI / 2)
    try {
      const positions = plane.getAttribute("position")
      const uv = plane.getAttribute("uv")
      for (let index = 0; index < positions.count; index += 1) {
        const expectedU = positions.getX(index) / ISLAND_SIZE + 0.5
        const expectedV = positions.getZ(index) / ISLAND_SIZE + 0.5
        const source = new Vector2(uv.getX(index), uv.getY(index))
        const mapped = source.clone().applyMatrix3(colorMap.matrix)
        expect(mapped.x).toBeCloseTo(expectedU, 6)
        expect(mapped.y).toBeCloseTo(expectedV, 6)
        const clamped = colorMap.transformUv(source)
        expect(clamped.x).toBeCloseTo(Math.max(0, Math.min(1, expectedU)), 6)
        expect(clamped.y).toBeCloseTo(Math.max(0, Math.min(1, expectedV)), 6)
      }
    } finally {
      material.dispose()
      colorMap.dispose()
      plane.dispose()
    }
  })
})
