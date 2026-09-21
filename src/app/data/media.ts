export const IMAGE_VARIANTS = {
  icon: [{ file: 'icon-512.png', width: 512, height: 512 }, { file: 'icon-32.png', width: 32, height: 32 }, { file: 'apple-180.png', width: 180, height: 180 }],
  social: [{ file: 'social-1200.png', width: 1200, height: 630 }],
} as const
export type MediaKind = keyof typeof IMAGE_VARIANTS
export type SiteMedia = { kind: MediaKind; version: string }
export const mediaUrl = (version: string, file: string) => `/media/${version}/${file}`
