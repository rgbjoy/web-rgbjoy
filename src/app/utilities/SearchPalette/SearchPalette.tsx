"use client"

import { X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  EXPERIMENTS,
  experimentSearchText,
  type Experiment,
} from "../../data/experiments"
import { LINKS, linkSearchText, type SiteLink } from "../../data/links"
import { PROJECTS, projectSearchText, type Project } from "../../data/projects"
import { closePalette, togglePalette, usePaletteOpen } from "./paletteState"
import styles from "./SearchPalette.module.css"

type Entry = {
  href: string
  title: string
  description?: string
  meta: string
  external: boolean
  haystack: string
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatDate(date: string): string {
  const [year, month] = date.split("-")
  return `${MONTHS[parseInt(month, 10) - 1] ?? ""} ’${year.slice(2)}`
}

/**
 * One flat index across projects, experiments and links, built once at module
 * load — the data is static, so rebuilding per keystroke would be pure waste.
 */
const INDEX: Entry[] = [
  ...PROJECTS.map((project: Project) => ({
    href: project.href,
    title: project.title,
    description: project.description,
    meta: project.year,
    external: true,
    haystack: projectSearchText(project),
  })),
  ...EXPERIMENTS.map((experiment: Experiment) => ({
    href: experiment.href,
    title: experiment.title,
    description: experiment.description,
    meta: formatDate(experiment.date),
    external: false,
    haystack: experimentSearchText(experiment),
  })),
  ...LINKS.map((link: SiteLink) => ({
    href: link.href,
    title: link.title,
    meta: "link",
    external: link.href.startsWith("http"),
    haystack: linkSearchText(link),
  })),
]

function PalettePanel({ pathname }: { pathname: string }) {
  const router = useRouter()
  const isOpen = usePaletteOpen()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Scrolling moves rows under a stationary cursor, which fires mouseenter and
  // moves the selection. Following that with scrollIntoView would fight the
  // scroll, so only keyboard moves are allowed to steer the list.
  const keyboardNavRef = useRef(false)

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return INDEX

    // Every term must match, so extra words narrow rather than widen.
    const terms = normalized.split(/\s+/)
    return INDEX.filter((entry) =>
      terms.every((term) => entry.haystack.includes(term)),
    )
  }, [query])

  const open = (entry: Entry) => {
    closePalette()
    if (entry.external) window.open(entry.href, "_blank", "noreferrer")
    else router.push(entry.href)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setSelectedIndex(0)
        togglePalette()
        return
      }

      if (!isOpen) return

      if (event.key === "Escape") {
        event.preventDefault()
        closePalette()
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        keyboardNavRef.current = true
        setSelectedIndex((current) =>
          results.length === 0 ? 0 : (current + 1) % results.length,
        )
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        keyboardNavRef.current = true
        setSelectedIndex((current) =>
          results.length === 0
            ? 0
            : (current - 1 + results.length) % results.length,
        )
        return
      }

      if (event.key === "Enter") {
        const selected = results[selectedIndex]
        if (!selected) return
        event.preventDefault()
        open(selected)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  useEffect(() => {
    if (!isOpen) return

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  // Keyboard selection has to drag the list with it, or arrowing past the fold
  // moves a highlight nobody can see.
  useEffect(() => {
    if (!isOpen || !keyboardNavRef.current) return
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex, isOpen])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={closePalette}>
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className={styles.header}>
          <p className={styles.title}>search</p>
          <button
            type="button"
            className={styles.close}
            onClick={closePalette}
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className={styles.field}>
          <span className={styles.slash} aria-hidden="true">
            /
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            placeholder="projects, experiments, links"
            aria-label="Search everything"
            spellCheck={false}
          />
        </div>

        {/* Lenis drives the page from wheel events, so without this the wheel
            over the results scrolls the page behind instead of this list. */}
        <div ref={listRef} className={styles.results} data-lenis-prevent>
          {results.length === 0 ? (
            <p className={styles.empty}>no matches.</p>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.href}
                type="button"
                data-index={index}
                className={`${styles.result} ${
                  index === selectedIndex ? styles.resultSelected : ""
                }`}
                onMouseEnter={() => {
                  keyboardNavRef.current = false
                  setSelectedIndex(index)
                }}
                onClick={() => open(entry)}
              >
                <span className={styles.resultBody}>
                  <span className={styles.resultTitle}>
                    {entry.title}
                    {entry.href === pathname ? (
                      <span className={styles.badge}>current</span>
                    ) : null}
                  </span>
                  {entry.description ? (
                    <span className={styles.resultDesc}>
                      {entry.description}
                    </span>
                  ) : null}
                </span>
                <span className={styles.resultMeta}>{entry.meta}</span>
              </button>
            ))
          )}
        </div>

        <p className={styles.hint}>
          arrows to navigate, enter to open, esc to close
        </p>
      </div>
    </div>
  )
}

export default function SearchPalette() {
  const pathname = usePathname()

  return <PalettePanel key={pathname} pathname={pathname} />
}
