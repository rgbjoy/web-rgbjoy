/** Two separable passes; sigma is measured in grid cells. Zero skips all work. */
export function gaussianSmoothGrid(
  source: Float32Array,
  stride: number,
  sigma: number,
) {
  if (sigma <= 0) return source

  const radius = Math.ceil(sigma * 3)
  const kernel = new Float64Array(radius * 2 + 1)
  let total = 0
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma))
    kernel[offset + radius] = weight
    total += weight
  }
  for (let index = 0; index < kernel.length; index += 1) {
    kernel[index] /= total
  }

  const horizontal = new Float32Array(source.length)
  const result = new Float32Array(source.length)
  for (let row = 0; row < stride; row += 1) {
    for (let column = 0; column < stride; column += 1) {
      let height = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const neighbor = Math.max(0, Math.min(stride - 1, column + offset))
        height += source[row * stride + neighbor] * kernel[offset + radius]
      }
      horizontal[row * stride + column] = height
    }
  }
  for (let row = 0; row < stride; row += 1) {
    for (let column = 0; column < stride; column += 1) {
      let height = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const neighbor = Math.max(0, Math.min(stride - 1, row + offset))
        height += horizontal[neighbor * stride + column] * kernel[offset + radius]
      }
      result[row * stride + column] = height
    }
  }
  return result
}
