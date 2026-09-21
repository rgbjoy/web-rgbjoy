import { decode, encode } from 'fast-png'

export function normalizePng(bytes: ArrayBuffer, width: number, height: number) {
  const input = Buffer.from(bytes)
  if (input.length < 33 || input.length > 4 * 1024 * 1024 || input.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || input.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG image.')
  if (input.readUInt32BE(16) !== width || input.readUInt32BE(20) !== height) throw new Error(`Image must be ${width}×${height}.`)
  const decoded = decode(input, { checkCrc: true })
  // Re-encode pixels, discarding ancillary metadata and any trailing data.
  return Buffer.from(encode({ width, height, data: decoded.data, channels: decoded.channels, depth: decoded.depth, palette: decoded.palette, transparency: decoded.transparency }))
}
