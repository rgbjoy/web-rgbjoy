import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three"

import { IMAGE, IMAGE_AFTER, LEDE, PARAGRAPHS, TITLE } from "./content"

/** Widest the text column is ever drawn, in CSS pixels. */
export const MAX_COLUMN_WIDTH = 700

/** Supersampling factor so the rasterized text stays crisp through the lens. */
const SCALE = 2
const PAD_X = 6
/** Vertical breathing room around the embedded image. */
const IMAGE_GAP = 28

type Block = {
  text: string
  font: string
  color: string
  lineHeight: number
  gapAfter: number
}

type Line = { text: string; y: number; font: string; color: string }
type ImageBox = { x: number; y: number; w: number; h: number }

function layout(ctx: CanvasRenderingContext2D, columnWidth: number) {
  const wrapWidth = columnWidth - PAD_X * 2
  const lines: Line[] = []
  const images: ImageBox[] = []
  let y = 0

  const draw = (block: Block) => {
    ctx.font = block.font
    const words = block.text.split(" ")
    let current = ""
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && ctx.measureText(candidate).width > wrapWidth) {
        lines.push({ text: current, y, font: block.font, color: block.color })
        y += block.lineHeight
        current = word
      } else {
        current = candidate
      }
    }
    if (current) {
      lines.push({ text: current, y, font: block.font, color: block.color })
      y += block.lineHeight
    }
    y += block.gapAfter
  }

  draw({ text: TITLE, font: "bold 42px Georgia, serif", color: "#f2f2f4", lineHeight: 48, gapAfter: 20 })
  draw({ text: LEDE, font: "italic 22px Georgia, serif", color: "#b9b9c2", lineHeight: 34, gapAfter: 32 })

  PARAGRAPHS.forEach((text, i) => {
    draw({ text, font: "19px Georgia, serif", color: "#e8e8ea", lineHeight: 33, gapAfter: 24 })

    if (i === IMAGE_AFTER) {
      // Reserve space from the known aspect ratio so layout is stable before the
      // image loads; the pixels get drawn once it's available.
      const w = wrapWidth
      const h = Math.round((w * IMAGE.height) / IMAGE.width)
      images.push({ x: PAD_X, y, w, h })
      y += h + IMAGE_GAP
    }
  })

  return { lines, images, height: Math.ceil(y) }
}

/**
 * Draws the whole article (text + embedded image) onto a transparent canvas at
 * the given column width and returns it as a texture.
 */
export function buildTextTexture(
  columnWidth: number,
  image: HTMLImageElement | null,
) {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  ctx.font = "19px Georgia, serif"
  const { lines, images, height } = layout(ctx, columnWidth)

  canvas.width = columnWidth * SCALE
  canvas.height = height * SCALE
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "top"

  if (image) {
    for (const box of images) {
      ctx.drawImage(image, box.x, box.y, box.w, box.h)
    }
  }

  for (const line of lines) {
    ctx.font = line.font
    ctx.fillStyle = line.color
    ctx.fillText(line.text, PAD_X, line.y)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4

  return { texture, width: columnWidth, height }
}
