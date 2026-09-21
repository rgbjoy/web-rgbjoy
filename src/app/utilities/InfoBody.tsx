import type { ReactNode } from 'react'
import type { InfoNode } from '../data/info-document'
import { safeInfoUrl, infoText } from '../data/info-document'

export function InfoBody({ node, count = Infinity, renderText = text => text, onContact, linkClass }: { node: InfoNode; count?: number; renderText?: (text: string, offset: number) => ReactNode; onContact?: () => void; linkClass?: string }) {
  function render(node: InfoNode, key: number, offset: number): ReactNode {
    if (node.type === 'text') {
      const text = node.text || ''
      let content = renderText(text.slice(0, Math.max(0, count - offset)), offset)
      const format = typeof node.format === 'number' ? node.format : 0
      if (format & 1) content = <strong>{content}</strong>
      if (format & 2) content = <em>{content}</em>
      return <span key={key}>{content}</span>
    }
    if (node.type === 'linebreak') { return <br key={key} /> }
    const children = node.children?.map((child, index, siblings) => render(child, index, offset + siblings.slice(0, index).reduce((sum, sibling) => sum + infoText(sibling).length + (sibling.type === 'paragraph' ? 1 : 0), 0)))
    if (node.type === 'paragraph') { return <p key={key}>{children}</p> }
    if (node.type === 'link' && node.url && safeInfoUrl(node.url)) {
      if (node.url === '#contact' && onContact) return <button key={key} type="button" className={linkClass} onClick={onContact}>{children}</button>
      return <a key={key} className={linkClass} href={node.url}>{children}</a>
    }
    return <div key={key}>{children}</div>
  }
  return <>{render(node, 0, 0)}</>
}
