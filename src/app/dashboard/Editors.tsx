'use client'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import type { StoredProject, SeoSetting } from '../data/content'
import SaveAction from './SaveAction'
import styles from './dashboard.module.css'

export async function saveRecord(body: unknown) {
  const response = await fetch('/dashboard/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json() as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Could not save.')
}
function Form({ children, body, saved, label = 'Save changes' }: {
  children: ReactNode; body: (data: FormData) => unknown; saved: () => void; label?: string
}) {
  const formId = useId()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setStatus('')
    try { await saveRecord(body(data)); setStatus('Saved.'); saved() }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save.') }
    finally { setBusy(false) }
  }
  return <form id={formId} onSubmit={submit} className={styles.editor}>
    <fieldset disabled={busy}>{children}</fieldset>
    <SaveAction><button className={styles.primaryButton} form={formId} disabled={busy}>{busy ? 'Saving…' : label}</button><span role="status">{status}</span></SaveAction>
  </form>
}
export function SeoEditor({ seo, saved }: { seo: SeoSetting; saved: () => void }) {
  return <Form saved={saved} body={data => ({ type: 'seo', id: seo.path, ...Object.fromEntries(data) })}>
    <p>This title and description are used throughout the site and in social previews.</p>
    <label>Page title<input name="title" defaultValue={seo.title} maxLength={200} /></label>
    <label>Search and social description<textarea name="description" defaultValue={seo.description} maxLength={2000} rows={4} /></label>
  </Form>
}
export function ProjectEditor({ project, saved }: { project?: StoredProject; saved: () => void }) {
  return <Form saved={saved} label={project ? 'Save project' : 'Add project'} body={data => ({
    type: 'project', id: project?.id ?? null, title: data.get('title'), url: data.get('url'), year: data.get('year'),
    description: data.get('description'), hidden: data.get('hidden') === 'on',
    technologies: String(data.get('technologies')).split(',').map(value => value.trim()).filter(Boolean),
  })}>
    <label>Title<input name="title" defaultValue={project?.title} required maxLength={200} /></label>
    <label>Project URL<input name="url" type="url" defaultValue={project?.url} placeholder="https://example.com" required maxLength={2000} /></label>
    <label>Year or status<input name="year" defaultValue={project?.year} placeholder="2026, Ongoing, Coming soon…" maxLength={100} /></label>
    <label>Description<textarea name="description" defaultValue={project?.description} rows={4} maxLength={2000} /></label>
    <label>Technologies, separated by commas<input name="technologies" defaultValue={project?.technologies.join(', ')} placeholder="React, TypeScript" /></label>
    <label className={styles.checkbox}><input name="hidden" type="checkbox" defaultChecked={Boolean(project?.hidden)} /> Hidden from public listings</label>
  </Form>
}
export function ProjectList({ projects, saved }: { projects: StoredProject[]; saved: () => void }) {
  const [active, setActive] = useState<string | null>(null)
  const adding = active === 'new'
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  async function remove(project: StoredProject) {
    if (!window.confirm(`Delete “${project.title}”? This removes its project record from the site.`)) return
    setDeleting(project.id); setError('')
    try { await saveRecord({ type: 'delete-project', id: project.id }); saved() }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not delete.') }
    finally { setDeleting(null) }
  }
  return <>
    <div className={styles.toolbar}><p>{projects.length} projects</p><button onClick={() => setActive(adding ? null : 'new')}>{adding ? 'Cancel' : 'Add project'}</button></div>
    {error && <p role="alert">{error}</p>}
    {adding && <ProjectEditor saved={() => { setActive(null); saved() }} />}
    {!projects.length && <p>No projects yet. Add your first project above.</p>}
    <ul className={styles.projects}>{projects.map(project => <li key={project.id}>
      <details open={active === project.id}><summary onClick={event => { event.preventDefault(); setActive(active === project.id ? null : project.id) }}><span>{project.title}</span><small>{project.hidden ? 'Hidden' : 'Visible'} · {project.year}</small></summary>
        {active === project.id && <><ProjectEditor key={JSON.stringify(project)} project={project} saved={saved} />
        <button className={styles.deleteButton} disabled={deleting === project.id} onClick={() => remove(project)}>{deleting === project.id ? 'Deleting…' : 'Delete project'}</button></>}
      </details>
    </li>)}</ul>
  </>
}
