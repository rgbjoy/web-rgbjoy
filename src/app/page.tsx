"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { ArrowUpRight, ChevronDown, Minus, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  EXPERIMENT_GROUPS,
  EXPERIMENTS,
  experimentSearchText,
  type Experiment,
} from "./data/experiments"
import { LINKS, linkSearchText, type SiteLink } from "./data/links"
import { PROJECTS, projectSearchText, type Project } from "./data/projects"
import { SITE } from "./data/site"
import { FluidVelocityBackground } from "./utilities/FluidVelocityBackground"
import styles from "./page.module.css"

type SortMode = "date" | "name"

const SORT_MODES: SortMode[] = ["date", "name"]

const SORT_LABELS: Record<SortMode, string> = {
  date: "Date",
  name: "A–Z",
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function formatDate(date: string): string {
  const [year, month] = date.split("-")
  const label = MONTHS[parseInt(month, 10) - 1] ?? ""
  return `${label} ’${year.slice(2)}`
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export default function Home() {
  const controlsRef = useRef<HTMLDivElement>(null)
  const [controlsStuck, setControlsStuck] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortMode>("date")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // The bar is pinned exactly when its own top reaches the pin point, so read
  // that rather than watching a sentinel: IntersectionObserver never fires here
  // in Chrome, most likely because of the overflow-x: clip on html and body.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    let frame = 0

    const measure = () => {
      frame = 0
      setControlsStuck(controls.getBoundingClientRect().top <= 0)
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [])

  const toggleGroup = (name: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // Searching reveals every match, so ignore collapsed state while filtering.
  const searching = query.trim().length > 0

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matches = normalized
      ? EXPERIMENTS.filter((experiment) =>
          experimentSearchText(experiment).includes(normalized),
        )
      : EXPERIMENTS

    return matches
      .slice()
      .sort((a, b) =>
        sort === "date"
          ? b.date.localeCompare(a.date)
          : a.title.localeCompare(b.title),
      )
  }, [query, sort])

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matches = normalized
      ? PROJECTS.filter((project) =>
          projectSearchText(project).includes(normalized),
        )
      : PROJECTS

    return matches
      .slice()
      .sort((a, b) =>
        sort === "date"
          ? b.year.localeCompare(a.year)
          : a.title.localeCompare(b.title),
      )
  }, [query, sort])

  const filteredLinks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matches = normalized
      ? LINKS.filter((link) => linkSearchText(link).includes(normalized))
      : LINKS

    // No dates to sort on, so date order is the order they are authored in.
    return sort === "name"
      ? matches.slice().sort((a, b) => a.title.localeCompare(b.title))
      : matches
  }, [query, sort])

  const groups = useMemo(
    () =>
      EXPERIMENT_GROUPS.map((name) => ({
        name,
        items: filtered.filter((experiment) => experiment.group === name),
      })).filter((group) => group.items.length > 0),
    [filtered],
  )

  const showEmpty =
    filtered.length === 0 &&
    filteredProjects.length === 0 &&
    filteredLinks.length === 0
  const experimentsOpen = searching || !collapsed.has("experiments")
  const projectsOpen = searching || !collapsed.has("client projects")
  const linksOpen = searching || !collapsed.has("links")

  const renderGroup = (group: { name: string; items: Experiment[] }) => {
    const isOpen = searching || !collapsed.has(group.name)

    return (
      <section key={group.name} className={styles.group}>
        <h3 className={styles.groupHeading}>
          <button
            type="button"
            className={styles.groupHeader}
            aria-expanded={isOpen}
            onClick={() => toggleGroup(group.name)}
          >
            {isOpen ? (
              <Minus
                className={styles.groupToggle}
                size={14}
                strokeWidth={1.75}
                aria-hidden
              />
            ) : (
              <Plus
                className={styles.groupToggle}
                size={14}
                strokeWidth={1.75}
                aria-hidden
              />
            )}
            <span className={styles.groupName}>{group.name}</span>
            <span className={styles.groupRule} />
            <span className={styles.groupCount}>
              {pad2(group.items.length)}
            </span>
          </button>
        </h3>

        {isOpen &&
          group.items.map((experiment) => (
            <ExperimentRow key={experiment.href} experiment={experiment} />
          ))}
      </section>
    )
  }

  return (
    <>
      <FluidVelocityBackground />
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.masthead}>
            <div className={styles.mastheadLead}>
              <h1 className={styles.title}>{SITE.name}</h1>
              <p className={styles.subtitle}>
                {SITE.intro.lead} {SITE.intro.invite}{" "}
                <a
                  className={styles.subtitleLink}
                  href={`mailto:${SITE.email}`}
                >
                  {SITE.intro.linkLabel}
                </a>
                .
              </p>
            </div>
          </header>

          <div
            ref={controlsRef}
            className={`${styles.controls} ${controlsStuck ? styles.controlsStuck : ""}`}
          >
            <div className={styles.search}>
              <span className={styles.searchSlash}>/</span>
              <input
                className={styles.searchInput}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="search the description"
                aria-label="Search the description"
              />
            </div>
            <div className={styles.sort}>
              <button
                type="button"
                className={`${styles.sortButton} ${sort === "date" ? styles.sortButtonActive : ""}`}
                onClick={() => setSort("date")}
              >
                Date
              </button>
              <button
                type="button"
                className={`${styles.sortButton} ${sort === "name" ? styles.sortButtonActive : ""}`}
                onClick={() => setSort("name")}
              >
                A–Z
              </button>
            </div>

            {/* Same choice as the buttons above, collapsed for narrow screens. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                className={styles.sortTrigger}
                aria-label={`Sort by ${SORT_LABELS[sort]}`}
              >
                {SORT_LABELS[sort]}
                <ChevronDown
                  className={styles.sortCaret}
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={styles.sortContent}
                  align="end"
                  sideOffset={10}
                >
                  <DropdownMenu.RadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as SortMode)}
                  >
                    {SORT_MODES.map((mode) => (
                      <DropdownMenu.RadioItem
                        key={mode}
                        className={styles.sortItem}
                        value={mode}
                      >
                        <span className={styles.sortMark} aria-hidden="true">
                          <DropdownMenu.ItemIndicator>
                            —
                          </DropdownMenu.ItemIndicator>
                        </span>
                        {SORT_LABELS[mode]}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <main className={styles.main}>
            {filteredProjects.length > 0 && (
              <section className={styles.category}>
                <h2 className={styles.categoryHeading}>
                  <button
                    type="button"
                    className={styles.categoryHeader}
                    aria-expanded={projectsOpen}
                    onClick={() => toggleGroup("client projects")}
                  >
                    {projectsOpen ? (
                      <Minus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    ) : (
                      <Plus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                    <span className={styles.categoryName}>client projects</span>
                    <span className={styles.categoryRule} />
                    <span className={styles.categoryCount}>
                      {pad2(filteredProjects.length)}
                    </span>
                  </button>
                </h2>

                {projectsOpen &&
                  filteredProjects.map((project) => (
                    <ProjectRow key={project.href} project={project} />
                  ))}
              </section>
            )}

            {filtered.length > 0 && (
              <section className={styles.category}>
                <h2 className={styles.categoryHeading}>
                  <button
                    type="button"
                    className={styles.categoryHeader}
                    aria-expanded={experimentsOpen}
                    onClick={() => toggleGroup("experiments")}
                  >
                    {experimentsOpen ? (
                      <Minus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    ) : (
                      <Plus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                    <span className={styles.categoryName}>experiments</span>
                    <span className={styles.categoryRule} />
                    <span className={styles.categoryCount}>
                      {pad2(filtered.length)}
                    </span>
                  </button>
                </h2>

                {experimentsOpen && groups.map(renderGroup)}
              </section>
            )}

            {filteredLinks.length > 0 && (
              <section className={styles.category}>
                <h2 className={styles.categoryHeading}>
                  <button
                    type="button"
                    className={styles.categoryHeader}
                    aria-expanded={linksOpen}
                    onClick={() => toggleGroup("links")}
                  >
                    {linksOpen ? (
                      <Minus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    ) : (
                      <Plus
                        className={styles.categoryToggle}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    )}
                    <span className={styles.categoryName}>links</span>
                    <span className={styles.categoryRule} />
                    <span className={styles.categoryCount}>
                      {pad2(filteredLinks.length)}
                    </span>
                  </button>
                </h2>

                {linksOpen &&
                  filteredLinks.map((link) => (
                    <LinkRow key={link.href} link={link} />
                  ))}
              </section>
            )}

            {showEmpty && (
              <div className={styles.empty}>
                <div className={styles.emptyHeading}>no matches.</div>
                <button
                  type="button"
                  className={styles.emptyReset}
                  onClick={() => setQuery("")}
                >
                  reset
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  )
}

function LinkRow({ link }: { link: SiteLink }) {
  // mailto: opens a mail client rather than a tab, so it skips target/rel.
  const external = link.href.startsWith("http")

  return (
    <a
      href={link.href}
      className={styles.item}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <div className={styles.itemBody}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{link.title}</span>
          <ArrowUpRight
            className={styles.itemExternal}
            size={14}
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
      </div>
    </a>
  )
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <a
      href={project.href}
      className={styles.item}
      target="_blank"
      rel="noreferrer"
    >
      <div className={styles.itemBody}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{project.title}</span>
          <ArrowUpRight
            className={styles.itemExternal}
            size={14}
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
        {project.description ? (
          <div className={styles.itemDesc}>{project.description}</div>
        ) : null}
      </div>
      <span className={styles.itemDate}>{project.year}</span>
    </a>
  )
}

function ExperimentRow({ experiment }: { experiment: Experiment }) {
  return (
    <Link href={experiment.href} className={styles.item}>
      <div className={styles.itemBody}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{experiment.title}</span>
        </div>
        <div className={styles.itemDesc}>{experiment.description}</div>
      </div>
      <span className={styles.itemDate}>{formatDate(experiment.date)}</span>
    </Link>
  )
}
