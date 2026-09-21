import type { SiteInfo } from './content'

export type InfoNode = { type: string; version: number; text?: string; format?: number | string; children?: InfoNode[]; url?: string; direction?: null; indent?: number; mode?: string; style?: string; detail?: number }
export type InfoDocument = { root: InfoNode }
const text = (value: string): InfoNode => ({ type: 'text', version: 1, text: value, format: 0, mode: 'normal', style: '', detail: 0 })
export function infoDocument(info: SiteInfo): InfoDocument {
  if (info.body) return JSON.parse(info.body) as InfoDocument
  return { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [text(`${info.lead} ${info.invite ? `${info.invite} ` : ''}`), { type: 'link', version: 1, url: '#contact', direction: null, format: '', indent: 0, children: [text(info.link_label)] }, text('.')] }] } }
}
export function infoText(node: InfoNode): string {
  if (node.type === 'text') return node.text || ''
  if (node.type === 'linebreak') return '\n'
  return (node.children || []).map(infoText).join(node.type === 'root' ? '\n' : '')
}
export function safeInfoUrl(url: string): boolean {
  if (url === '#contact') return true
  try { const parsed = new URL(url); return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
}
// Store a small, allowlisted Lexical document; never accept HTML or arbitrary styles.
export function validateInfoDocument(value: unknown): InfoDocument {
  let count = 0
  function visit(value: unknown, depth: number, parent: string): InfoNode {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8 || ++count > 1000) throw new Error('Invalid bio document.')
    const node = value as Record<string, unknown>
    const type = node.type
    const allowed = parent === '' ? ['root'] : parent === 'root' ? ['paragraph'] : parent === 'paragraph' ? ['text', 'linebreak', 'link'] : ['text', 'linebreak']
    if (typeof type !== 'string' || !allowed.includes(type)) throw new Error('Invalid bio formatting.')
    if (type === 'text') {
      if (typeof node.text !== 'string') throw new Error('Invalid bio text.')
      const result = text(node.text)
      result.format = typeof node.format === 'number' ? node.format & 3 : 0
      return result
    }
    if (type === 'linebreak') return { type, version: 1 }
    if (!Array.isArray(node.children)) throw new Error('Invalid bio content.')
    const result: InfoNode = { type, version: 1, direction: null, indent: 0, format: '', children: node.children.map(child => visit(child, depth + 1, type)) }
    if (type === 'link') {
      if (typeof node.url !== 'string' || node.url.length > 2000 || !safeInfoUrl(node.url)) throw new Error('Invalid link. Use https, http, mailto, or #contact.')
      result.url = node.url
    }
    return result
  }
  const document = { root: visit((value as InfoDocument)?.root, 0, '') }
  const plain = infoText(document.root)
  if (!plain.trim() || plain.length > 5000) throw new Error('Invalid bio. Enter between 1 and 5,000 characters.')
  return document
}
