'use client'

import { useRouter } from 'next/navigation'
import ImageUploads from './ImageUploads'
import type { SiteMedia } from '../data/media'
import { useEffect, useState, type FormEvent } from 'react'
import type { StoredProject, SiteInfo, SeoSetting } from '../data/content'
import styles from './dashboard.module.css'

import { SaveTarget } from './SaveAction'
import InfoEditor from './InfoEditor'
import { ProjectList, SeoEditor } from './Editors'

type Data = { media: SiteMedia[]; projects: StoredProject[]; info: SiteInfo; seo: SeoSetting[] }
export default function Dashboard() {
  const router = useRouter()
  const [saveTarget, setSaveTarget] = useState<HTMLDivElement | null>(null)
  const [section, setSection] = useState<'Info' | 'Projects' | 'SEO'>('Info')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState('')
  const saved = () => { setNotice('Saved. Your changes are live.'); setRefresh(value => value + 1); router.refresh() }
  useEffect(() => {
    const controller = new AbortController()
    fetch('/dashboard/api', { signal: controller.signal }).then(async response => {
      if (response.status === 401) { setNeedsLogin(true); return }
      if (!response.ok) throw new Error('Could not load settings.')
      setNeedsLogin(false)
      setData(await response.json())
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [refresh])
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = new FormData(form).get('password')
    setSigningIn(true)
    setError('')
    try {
      const response = await fetch('/dashboard/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error || 'Could not sign in.')
      form.reset()
      setNeedsLogin(false)
      setRefresh(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in.') }
    finally { setSigningIn(false) }
  }
  async function logout() {
    try {
      const response = await fetch('/dashboard/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Could not sign out.')
      setData(null)
      setNeedsLogin(true)
      setError('')
    } catch { setError('Could not sign out. Please try again.') }
  }
  return <SaveTarget.Provider value={saveTarget}><main className={styles.dashboard}>
    <nav className={styles.accountLinks} aria-label="Account links">
      {/* Full navigation fetches current public layout data after editing. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/">View site ↗</a>
      {data && <button onClick={logout}>Sign out</button>}
    </nav>
    <h1>Dashboard</h1>
    {error && <p role="alert">{error}</p>}
    {needsLogin && <form onSubmit={login} className={styles.editor}>
      <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} autoFocus /></label>
      <button disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</button>
    </form>}
    {!data && !error && !needsLogin && <p>Loading…</p>}
    {data && <>
      <nav className={styles.tabs} aria-label="Dashboard sections">{(['Info', 'Projects', 'SEO'] as const).map(name =>
        <button key={name} aria-current={section === name ? 'page' : undefined} onClick={() => { setSection(name); setNotice('') }}>{name}</button>
      )}</nav>
      <h2>{section}</h2>
      <p role="status">{notice}</p>
      {section === 'Info' && <InfoEditor key={JSON.stringify(data.info)} info={data.info} saved={saved} />}
      {section === 'Projects' && <ProjectList projects={data.projects} saved={saved} />}
      {section === 'SEO' && <><p>Page titles and descriptions for search results and social previews.</p>{data.seo.map(seo =>
        <SeoEditor key={JSON.stringify(seo)} seo={seo} saved={saved} />
      )}<ImageUploads media={data.media} saved={saved} /></>}
    </>}
    <div className={styles.saveBar}><div ref={setSaveTarget} className={styles.saveBarInner} /></div>
  </main></SaveTarget.Provider>
}
