import { getPublicCatalog, getSeo, getInfo } from "../server/content"
import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_PROFILE } from '../data/catalog'
import { directoryStructuredData, serializeJsonLd } from '../data/structured-data'
import styles from './page.module.css'

export const metadata: Metadata = { alternates: { canonical: '/directory' } }

export default async function DirectoryPage() {
  const entries = await getPublicCatalog()
  const info = await getInfo()
  const seo = await getSeo()
  return (
    <main className={styles.directory}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(directoryStructuredData(entries)) }}
      />
      <Link href="/">← rgbjoy.com</Link>
      <header>
        <h1>rgbjoy — {info.author}</h1>
        <p>rgbjoy is the online identity and portfolio of {info.author}.</p>
        <p>{seo.description}</p>
      </header>
      {(['project', 'experiment'] as const).map((kind) => (
        <section key={kind}>
          <h2>{kind === 'project' ? 'Projects' : 'Experiments'}</h2>
          {entries.filter((entry) => entry.kind === kind).map((entry) => (
            <article key={entry.id} id={entry.id}>
              <h3>
                <a href={entry.url}>{entry.title}</a>
              </h3>
              <p>{entry.description ?? 'No description has been published for this project.'}</p>
              <p className={styles.details}>
                {entry.kind === 'project'
                  ? entry.year
                  : `${entry.category} · ${entry.publishedMonth} · ${entry.status}`}
                {entry.technologies.length > 0 && ` · ${entry.technologies.join(', ')}`}
              </p>
            </article>
          ))}
        </section>
      ))}
      <section>
        <h2>Elsewhere</h2>
        <nav aria-label="Social profiles">
          {PUBLIC_PROFILE.profiles.map((profile) => (
            <a key={profile.url} href={profile.url}>
              {profile.name}
            </a>
          ))}
        </nav>
      </section>
      <footer>
        <p>
          Read this directory as <a href="/llms.txt">plain text</a> or{' '}
          <a href="/api/catalog">JSON</a>.
        </p>
        <p>
          The public API supports <code>q</code> search and <code>kind=project</code> or{' '}
          <code>kind=experiment</code>. <a href="/openapi.json">API schema</a>
        </p>
      </footer>
    </main>
  )
}
