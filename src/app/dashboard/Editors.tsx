'use client'
import * as Checkbox from '@radix-ui/react-checkbox'
import { Check, GripVertical } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { StoredProject, SeoSetting } from '../data/content'
import type { MediaKind, SiteMedia } from '../data/media'
import ImageUpload from './ImageUploads'
import SaveAction from './SaveAction'
import styles from './dashboard.module.css'

export async function saveRecord(body: unknown) {
  const response = await fetch('/dashboard/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json() as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Could not save.')
}
function TabForm({ children, submit, saved, changeKey, processing = false }: { changeKey: string; children: ReactNode; submit: (data: FormData) => Promise<void>; saved: () => void; processing?: boolean }) {
  const id = useId()
  const [savedKey, setSavedKey] = useState(changeKey)
  const dirty = changeKey !== savedKey
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dirty || busy || processing) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setStatus('')
    try { await submit(data); setSavedKey(changeKey); saved(); setStatus('Saved.') }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save.') }
    finally { setBusy(false) }
  }
  return <form id={id} onSubmit={save} className={styles.editor}>
    <fieldset disabled={busy}>{children}</fieldset>
    <SaveAction><button className={styles.primaryButton} form={id} disabled={busy || processing || !dirty}>{busy ? 'Saving…' : processing ? 'Processing images…' : 'Save changes'}</button><span role="status">{status}</span></SaveAction>
  </form>
}
export function SeoEditor({ seo, media, saved }: { seo: SeoSetting; media: SiteMedia[]; saved: () => void }) {
  const [title, setTitle] = useState(seo.title)
  const [description, setDescription] = useState(seo.description)
  const [imageRevision, setImageRevision] = useState(0)
  const [images, setImages] = useState<Partial<Record<MediaKind, FormData>>>({})
  const [processing, setProcessing] = useState<Partial<Record<MediaKind, boolean>>>({})
  return <TabForm saved={saved} changeKey={JSON.stringify([title.trim(), description.trim(), Object.values(images).some(Boolean) ? imageRevision : 0])} processing={Object.values(processing).some(Boolean)} submit={async data => {
    for (const [kind, image] of Object.entries(images)) for (const [file, value] of image?.entries() ?? []) data.set(`${kind}:${file}`, value)
    const response = await fetch('/dashboard/media?kind=seo', { method: 'POST', body: data })
    if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error || 'Could not save SEO.')
  }}>
    <p>This title and description are used throughout the site and in social previews.</p>
    <label>Page title<input name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} /></label>
    <label>Search and social description<textarea name="description" value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={4} /></label>
    {(['icon', 'social'] as const).map(kind => <ImageUpload key={kind} kind={kind} current={media.find(image => image.kind === kind)} onChange={data => { setImages(values => ({ ...values, [kind]: data })); if (data) setImageRevision(value => value + 1) }} onBusy={busy => setProcessing(values => ({ ...values, [kind]: busy }))} />)}
  </TabForm>
}
type Draft = Omit<StoredProject, 'technologies'> & { technologies: string; removed?: boolean; isNew?: boolean }
export function ProjectList({ projects, saved }: { projects: StoredProject[]; saved: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => projects.map(project => ({ ...project, technologies: project.technologies.join(', ') })))
  const [active, setActive] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  function update(id: string, values: Partial<Draft>) { setDrafts(rows => rows.map(row => row.id === id ? { ...row, ...values } : row)) }
  function move(id: string, to: number) {
    setDrafts(rows => {
      const from = rows.findIndex(row => row.id === id)
      if (from < 0 || to < 0 || to >= rows.length || from === to) return rows
      const next = [...rows]
      next.splice(to, 0, ...next.splice(from, 1))
      return next
    })
  }
  function dragStart(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(null); setDragging(id)
  }
  function dragMove(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (dragging !== id || !list.current) return
    // Target index = how many other rows sit above the pointer, which stays stable as rows shift.
    const others = [...list.current.children].filter(item => (item as HTMLElement).dataset.id !== id)
    move(id, others.filter(item => { const rect = item.getBoundingClientRect(); return rect.top + rect.height / 2 < event.clientY }).length)
  }
  function dragKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!offset) return
    event.preventDefault()
    move(id, drafts.findIndex(row => row.id === id) + offset)
  }
  const changeKey = JSON.stringify(drafts.filter(row => !(row.isNew && row.removed)).map(row => ({
    id: row.id, removed: Boolean(row.removed), title: row.title.trim(), url: row.url.trim(),
    year: row.year.trim(), description: row.description.trim(), hidden: Boolean(row.hidden),
    technologies: [...new Set(row.technologies.split(',').map(value => value.trim()).filter(Boolean))],
  })))
  return <TabForm saved={saved} changeKey={changeKey} submit={async () => {
    await saveRecord({ type: 'projects', projects: drafts.map(row => ({ ...row, hidden: Boolean(row.hidden), technologies: row.technologies.split(',').map(value => value.trim()).filter(Boolean) })) })
  }}>
    <div className={styles.toolbar}><p>{drafts.filter(row => !row.removed).length} projects</p><button type="button" onClick={() => {
      const id = `project:${crypto.randomUUID()}`
      setDrafts(rows => [...rows, { id, title: '', url: '', year: '', description: '', technologies: '', hidden: 0, position: rows.length, isNew: true }]); setActive(id)
    }}>Add project</button></div>
    <ul ref={list} className={styles.projects}>{drafts.map(project => <li key={project.id} data-id={project.id} data-dragging={dragging === project.id || undefined}>
      <button type="button" className={styles.dragHandle} aria-label={`Reorder ${project.title || 'new project'}. Use the up and down arrow keys.`}
        onPointerDown={event => dragStart(event, project.id)} onPointerMove={event => dragMove(event, project.id)}
        onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} onKeyDown={event => dragKey(event, project.id)}><GripVertical size={18} aria-hidden="true" /></button>
      <div>
      {project.removed ? <div className={styles.toolbar}><p>{project.title} · Will be deleted</p><button type="button" onClick={() => update(project.id, { removed: false })}>Undo removal</button></div> : <details open={active === project.id}>
        <summary onClick={event => { event.preventDefault(); setActive(active === project.id ? null : project.id) }}><span>{project.title || 'New project'}</span><small>{project.hidden ? 'Hidden' : 'Visible'} · {project.year}</small></summary>
        <div className={styles.editor}>
          <label>Title<input value={project.title} onChange={e => update(project.id, { title: e.target.value })} maxLength={200} /></label>
          <label>Project URL<input value={project.url} onChange={e => update(project.id, { url: e.target.value })} placeholder="https://example.com" maxLength={2000} /></label>
          <label>Year or status<input value={project.year} onChange={e => update(project.id, { year: e.target.value })} maxLength={100} /></label>
          <label>Description<textarea value={project.description} onChange={e => update(project.id, { description: e.target.value })} rows={4} maxLength={2000} /></label>
          <label>Technologies, separated by commas<input value={project.technologies} onChange={e => update(project.id, { technologies: e.target.value })} /></label>
          <div className={styles.checkbox}><Checkbox.Root id={project.id} checked={Boolean(project.hidden)} onCheckedChange={value => update(project.id, { hidden: Number(value === true) })} className={styles.checkboxControl}><Checkbox.Indicator className={styles.checkboxIndicator}><Check size={14} aria-hidden="true" /></Checkbox.Indicator></Checkbox.Root><label htmlFor={project.id}>Hidden from public listings</label></div>
          <button type="button" className={styles.deleteButton} onClick={() => update(project.id, { removed: true })}>Remove project</button>
        </div>
      </details>}
      </div>
    </li>)}</ul>
  </TabForm>
}
