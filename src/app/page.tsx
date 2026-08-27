"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import gsap from "gsap"
import { ArrowUpRight, ChevronDown, Minus, Plus, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

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

const TITLE_TEXT = SITE.name
const INTRO_LEAD = `${SITE.intro.lead} `
const INTRO_INVITE = `${SITE.intro.invite} `
const INTRO_LINK = SITE.intro.linkLabel
const INTRO_END = "."
const INTRO_TOTAL =
  INTRO_LEAD.length + INTRO_INVITE.length + INTRO_LINK.length + INTRO_END.length

/** ~ms per character; title runs a touch faster than the body. */
const TITLE_CHAR_MS = 28
const INTRO_CHAR_MS = 16
/** Whole intro timeline runs at this multiple of real time. */
const INTRO_TIME_SCALE = 3

function sliceIntro(count: number) {
  const lead = INTRO_LEAD.slice(0, Math.min(count, INTRO_LEAD.length))
  const invite = INTRO_INVITE.slice(
    0,
    Math.max(0, Math.min(count - INTRO_LEAD.length, INTRO_INVITE.length)),
  )
  const link = INTRO_LINK.slice(
    0,
    Math.max(
      0,
      Math.min(
        count - INTRO_LEAD.length - INTRO_INVITE.length,
        INTRO_LINK.length,
      ),
    ),
  )
  const end = INTRO_END.slice(
    0,
    Math.max(
      0,
      count - INTRO_LEAD.length - INTRO_INVITE.length - INTRO_LINK.length,
    ),
  )
  return { lead, invite, link, end }
}

function Masthead({
  titleCount,
  introCount,
}: {
  titleCount: number
  introCount: number
}) {
  const intro = sliceIntro(introCount)

  return (
    <header className={styles.masthead}>
      <div className={styles.mastheadLead}>
        <h1 className={styles.title}>{TITLE_TEXT.slice(0, titleCount)}</h1>
        <p className={styles.subtitle}>
          <span className={styles.subtitleMeasure} aria-hidden="true">
            {INTRO_LEAD}
            {INTRO_INVITE}
            <a className={styles.subtitleLink} href={`mailto:${SITE.email}`}>
              {INTRO_LINK}
            </a>
            {INTRO_END}
          </span>
          <span className={styles.subtitleLive}>
            {intro.lead}
            {intro.invite}
            {intro.link.length > 0 ? (
              <a className={styles.subtitleLink} href={`mailto:${SITE.email}`}>
                {intro.link}
              </a>
            ) : null}
            {intro.end}
          </span>
        </p>
      </div>
    </header>
  )
}

function CategoryHeader({
  name,
  count,
  open,
  onToggle,
}: {
  name: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <h2 className={styles.categoryHeading}>
      <button
        type="button"
        className={styles.categoryHeader}
        data-category=""
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? (
          <Minus
            className={styles.categoryToggle}
            data-intro="toggle"
            size={14}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : (
          <Plus
            className={styles.categoryToggle}
            data-intro="toggle"
            size={14}
            strokeWidth={1.75}
            aria-hidden
          />
        )}
        <span className={styles.categoryName} data-intro="name">
          {name}
        </span>
        <span className={styles.categoryRule} data-intro="rule" />
        <span className={styles.categoryCount} data-intro="count">
          {pad2(count)}
        </span>
      </button>
    </h2>
  )
}

export default function Home() {
  const controlsRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [controlsStuck, setControlsStuck] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortMode>("date")
  const [titleCount, setTitleCount] = useState(0)
  const [introCount, setIntroCount] = useState(0)
  const [introPending, setIntroPending] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () =>
      new Set([
        "client projects",
        "experiments",
        "links",
        ...EXPERIMENT_GROUPS,
      ]),
  )

  // Load choreography: headline → desc → search → each category (+ name, line, count).
  useLayoutEffect(() => {
    const controls = controlsRef.current
    const main = mainRef.current
    if (!controls || !main) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const categories = Array.from(
      main.querySelectorAll<HTMLElement>("[data-category]"),
    )

    if (reduced) {
      setTitleCount(TITLE_TEXT.length)
      setIntroCount(INTRO_TOTAL)
      setIntroPending(false)
      return
    }

    const parts = categories.map((category) => ({
      lead: [
        category.querySelector('[data-intro="toggle"]'),
        category.querySelector('[data-intro="name"]'),
      ].filter(Boolean),
      rule: category.querySelector('[data-intro="rule"]'),
      count: category.querySelector('[data-intro="count"]'),
    }))

    // CSS already hides these; lock matching GSAP state before the timeline runs.
    gsap.set(controls, { autoAlpha: 0 })
    for (const part of parts) {
      gsap.set(part.lead, { autoAlpha: 0 })
      gsap.set(part.count, { autoAlpha: 0 })
      gsap.set(part.rule, { scaleX: 0, transformOrigin: "left center" })
    }

    const title = { i: 0 }
    const intro = { i: 0 }
    const timeline = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => setIntroPending(false),
    })
    timeline.timeScale(INTRO_TIME_SCALE)

    timeline
      .to(title, {
        i: TITLE_TEXT.length,
        duration: (TITLE_TEXT.length * TITLE_CHAR_MS) / 1000,
        onUpdate: () => setTitleCount(Math.floor(title.i)),
        onComplete: () => setTitleCount(TITLE_TEXT.length),
      })
      .to(intro, {
        i: INTRO_TOTAL,
        duration: (INTRO_TOTAL * INTRO_CHAR_MS) / 1000,
        onUpdate: () => setIntroCount(Math.floor(intro.i)),
        onComplete: () => setIntroCount(INTRO_TOTAL),
      })
      .to(controls, {
        autoAlpha: 1,
        duration: 0.35,
      })

    for (const part of parts) {
      timeline
        .to(
          part.lead,
          {
            autoAlpha: 1,
            duration: 0.22,
          },
          "+=0.06",
        )
        .to(part.rule, {
          scaleX: 1,
          duration: 0.45,
        })
        .to(part.count, {
          autoAlpha: 1,
          duration: 0.2,
        })
    }

    return () => {
      timeline.kill()
      gsap.set(controls, { clearProps: "opacity,visibility" })
      for (const part of parts) {
        gsap.set(part.lead, { clearProps: "opacity,visibility" })
        gsap.set(part.count, { clearProps: "opacity,visibility" })
        gsap.set(part.rule, { clearProps: "transform,transformOrigin" })
      }
    }
  }, [])

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
      <div
        className={`${styles.page} ${introPending ? styles.introPending : ""}`}
      >
        <div className={styles.container}>
          <Masthead titleCount={titleCount} introCount={introCount} />

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
              {query.length > 0 && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden />
                </button>
              )}
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

          <main ref={mainRef} className={styles.main}>
            {filteredProjects.length > 0 && (
              <section className={styles.category}>
                <CategoryHeader
                  name="client projects"
                  count={filteredProjects.length}
                  open={projectsOpen}
                  onToggle={() => toggleGroup("client projects")}
                />

                {projectsOpen &&
                  filteredProjects.map((project) => (
                    <ProjectRow key={project.href} project={project} />
                  ))}
              </section>
            )}

            {filtered.length > 0 && (
              <section className={styles.category}>
                <CategoryHeader
                  name="experiments"
                  count={filtered.length}
                  open={experimentsOpen}
                  onToggle={() => toggleGroup("experiments")}
                />

                {experimentsOpen && groups.map(renderGroup)}
              </section>
            )}

            {filteredLinks.length > 0 && (
              <section className={styles.category}>
                <CategoryHeader
                  name="links"
                  count={filteredLinks.length}
                  open={linksOpen}
                  onToggle={() => toggleGroup("links")}
                />

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
