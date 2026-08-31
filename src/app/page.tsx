"use client"

import gsap from "gsap"
import {
  ArrowUpRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Minus,
  Plus,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import {
  EXPERIMENT_GROUPS,
  EXPERIMENTS,
  type Experiment,
} from "./data/experiments"
import { LINKS, type SiteLink } from "./data/links"
import { PROJECTS, type Project } from "./data/projects"
import { SITE } from "./data/site"
import { ContactDialog } from "./utilities/contact/ContactDialog"
import {
  collapseAll,
  expandAll,
  seedCollapsed,
  setSort,
  toggleCollapsed,
  useIndexState,
} from "./utilities/useIndexState"
import { FluidVelocityBackground } from "./utilities/FluidVelocityBackground"
import { openPalette } from "./utilities/SearchPalette/paletteState"
import { SettingsMenu } from "./utilities/settings/SettingsMenu"
import { SmoothScroll } from "./utilities/SmoothScroll"
import { useReducedMotion, useTheme } from "./utilities/settings/useSettings"
import styles from "./page.module.css"

/** Every section that can be opened or closed, parents and groups alike. */
const COLLAPSIBLE = ["projects", "experiments", "links", ...EXPERIMENT_GROUPS]

// Everything starts closed on a first visit; a restored session overrides this.
seedCollapsed(COLLAPSIBLE)

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
/** Beat of stillness before the intro starts typing. Real seconds — a timeline's
 *  own delay sits on the parent timeline, so INTRO_TIME_SCALE does not shrink it. */
const INTRO_DELAY_S = 0.35
/**
 * The intro is a greeting, not a page transition: arriving should play it,
 * coming back should not. Back-navigation remounts this component, which
 * replayed the whole timeline — and until it finished the controls were hidden
 * and the title empty, so the page read as frozen.
 *
 * Two signals, because a return trip can arrive two different ways. A
 * client-side route change keeps this module loaded, so the flag survives it. A
 * real document-level back/forward re-executes everything, and only the
 * navigation type can tell that apart from a fresh load.
 *
 * Deliberately NOT sessionStorage: that also suppressed the intro on reload,
 * which is both surprising and impossible to demo.
 */
let introPlayedThisLoad = false

function shouldSkipIntro(): boolean {
  if (introPlayedThisLoad) return true

  try {
    const [entry] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[]
    return entry?.type === "back_forward"
  } catch {
    return false
  }
}

function markIntroPlayed() {
  introPlayedThisLoad = true
}
/** One per character, picked once per mount. */
const CHAR_SEEDS = ["var(--seed-r)", "var(--seed-g)", "var(--seed-b)"]

function makeSeeds(count: number): string[] {
  return Array.from(
    { length: count },
    () => CHAR_SEEDS[Math.floor(Math.random() * CHAR_SEEDS.length)],
  )
}

/**
 * Renders text one span per character so each can fade in from its own seed.
 *
 * Keys are absolute positions in the whole string, not per-call indices, so a
 * character keeps its DOM node as the text grows — otherwise React would rebuild
 * the spans every frame and restart every animation mid-fade. `offset` is where
 * this fragment starts within the full run, since the intro arrives in pieces.
 */
function TypedText({
  text,
  seeds,
  offset = 0,
}: {
  text: string
  seeds: string[]
  offset?: number
}) {
  return (
    <>
      {Array.from(text, (character, index) => (
        <span
          key={offset + index}
          className={styles.typedChar}
          style={{ "--char-seed": seeds[offset + index] } as React.CSSProperties}
        >
          {character}
        </span>
      ))}
    </>
  )
}

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
  onContact,
  onSearch,
  lockupRef,
  lockupStuck,
}: {
  titleCount: number
  introCount: number
  onContact: () => void
  onSearch: () => void
  lockupRef: React.RefObject<HTMLDivElement | null>
  lockupStuck: boolean
}) {
  const intro = sliceIntro(introCount)
  // Held in state so a re-render never reshuffles a character mid-fade. The
  // server renders no characters (counts start at 0), so the randomness here
  // cannot desync hydration.
  const [titleSeeds] = useState(() => makeSeeds(TITLE_TEXT.length))
  const [introSeeds] = useState(() => makeSeeds(INTRO_TOTAL))

  return (
    <>
      {/* A sibling of the list, not a child of the header — a sticky element
          only stays pinned while its own parent is in view, and the header
          scrolls away with the subtitle. */}
      <div
        ref={lockupRef}
        className={`${styles.lockup} ${lockupStuck ? styles.lockupStuck : ""}`}
      >
        <h1 className={styles.title}>
          <TypedText text={TITLE_TEXT.slice(0, titleCount)} seeds={titleSeeds} />
        </h1>
        {/* Deliberately outside the intro timeline: someone who needs reduced
            motion should not have to sit through an animation to reach it. */}
        <SettingsMenu onContact={onContact} onSearch={onSearch} />
      </div>

      <header className={styles.masthead}>
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
            <TypedText text={intro.lead} seeds={introSeeds} />
            <TypedText
              text={intro.invite}
              seeds={introSeeds}
              offset={INTRO_LEAD.length}
            />
            {intro.link.length > 0 ? (
              <button
                type="button"
                className={styles.subtitleLink}
                onClick={onContact}
              >
                <TypedText
                  text={intro.link}
                  seeds={introSeeds}
                  offset={INTRO_LEAD.length + INTRO_INVITE.length}
                />
              </button>
            ) : null}
            <TypedText
              text={intro.end}
              seeds={introSeeds}
              offset={
                INTRO_LEAD.length + INTRO_INVITE.length + INTRO_LINK.length
              }
            />
          </span>
        </p>
      </header>
    </>
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
  const lockupRef = useRef<HTMLDivElement>(null)
  const [lockupStuck, setLockupStuck] = useState(false)
  const introPlayedRef = useRef(false)
  const [contactOpen, setContactOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const theme = useTheme()
  const [controlsStuck, setControlsStuck] = useState(false)
  const { collapsed, sort } = useIndexState()
  const [titleCount, setTitleCount] = useState(0)
  const [introCount, setIntroCount] = useState(0)
  const [introPending, setIntroPending] = useState(true)

  // Load choreography: headline → desc → search → each category (+ name, line, count).
  useLayoutEffect(() => {
    const controls = controlsRef.current
    const main = mainRef.current
    if (!controls || !main) return

    const categories = Array.from(
      main.querySelectorAll<HTMLElement>("[data-category]"),
    )

    // Toggling the setting re-runs this, and back-navigation remounts it. Either
    // way, snap to the finished state rather than replaying the intro at someone
    // who has already read it.
    if (reducedMotion || introPlayedRef.current || shouldSkipIntro()) {
      introPlayedRef.current = true
      markIntroPlayed()
      setTitleCount(TITLE_TEXT.length)
      setIntroCount(INTRO_TOTAL)
      setIntroPending(false)
      return
    }

    const parts = categories.map((category) => {
      // A restored session can have categories already open, so their rows are in
      // the DOM before the heading that introduces them. Everything under the
      // heading waits its turn with the heading rather than sitting there first.
      const section = category.closest("section")
      const body = section
        ? Array.from(section.children).filter(
            (child) => child.tagName !== "H2",
          )
        : []

      return {
        lead: [
          category.querySelector('[data-intro="toggle"]'),
          category.querySelector('[data-intro="name"]'),
        ].filter(Boolean),
        rule: category.querySelector('[data-intro="rule"]'),
        count: category.querySelector('[data-intro="count"]'),
        body,
      }
    })

    // CSS already hides these; lock matching GSAP state before the timeline runs.
    gsap.set(controls, { autoAlpha: 0 })
    for (const part of parts) {
      gsap.set(part.lead, { autoAlpha: 0 })
      gsap.set(part.count, { autoAlpha: 0 })
      if (part.body.length > 0) gsap.set(part.body, { autoAlpha: 0 })
      gsap.set(part.rule, { scaleX: 0, transformOrigin: "left center" })
    }

    const title = { i: 0 }
    const intro = { i: 0 }
    const timeline = gsap.timeline({
      delay: INTRO_DELAY_S,
      defaults: { ease: "power2.out" },
      onComplete: () => {
        introPlayedRef.current = true
        markIntroPlayed()
        setIntroPending(false)
      },
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

      // A collapsed category has no rows to reveal. GSAP warns on an empty target
      // list, and an empty tween would still hold the timeline open.
      if (part.body.length > 0) {
        timeline.to(part.body, {
          autoAlpha: 1,
          duration: 0.3,
        })
      }
    }

    return () => {
      timeline.kill()
      gsap.set(controls, { clearProps: "opacity,visibility" })
      for (const part of parts) {
        gsap.set(part.lead, { clearProps: "opacity,visibility" })
        gsap.set(part.count, { clearProps: "opacity,visibility" })
        if (part.body.length > 0) {
          gsap.set(part.body, { clearProps: "opacity,visibility" })
        }
        gsap.set(part.rule, { clearProps: "transform,transformOrigin" })
      }
    }
  }, [reducedMotion])

  // The bar is pinned exactly when its own top reaches the pin point, so read
  // that rather than watching a sentinel: IntersectionObserver never fires here
  // in Chrome, most likely because of the overflow-x: clip on html and body.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    let frame = 0

    const measure = () => {
      frame = 0
      const lockup = lockupRef.current
      // The controls park below the lockup rather than at the viewport edge, so
      // "pinned" is measured against the lockup's height, not against zero.
      const offset = lockup?.offsetHeight ?? 0
      setControlsStuck(controls.getBoundingClientRect().top <= offset + 1)
      if (lockup) setLockupStuck(lockup.getBoundingClientRect().top <= 0)
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

  const toggleGroup = toggleCollapsed

  // Counted against the known list rather than the set's size, so a stale name
  // restored from a previous session cannot make "all collapsed" unreachable.
  const collapsedCount = COLLAPSIBLE.filter((name) => collapsed.has(name)).length
  const allExpanded = collapsedCount === 0
  const allCollapsed = collapsedCount === COLLAPSIBLE.length

  const filtered = useMemo(
    () =>
      EXPERIMENTS.slice().sort((a, b) =>
        sort === "date"
          ? b.date.localeCompare(a.date)
          : a.title.localeCompare(b.title),
      ),
    [sort],
  )

  const filteredProjects = useMemo(
    () =>
      PROJECTS.slice().sort((a, b) =>
        sort === "date"
          ? b.year.localeCompare(a.year)
          : a.title.localeCompare(b.title),
      ),
    [sort],
  )

  // No dates to sort on, so date order is the order they are authored in.
  const filteredLinks = useMemo(
    () =>
      sort === "name"
        ? LINKS.slice().sort((a, b) => a.title.localeCompare(b.title))
        : LINKS,
    [sort],
  )

  const groups = useMemo(
    () =>
      EXPERIMENT_GROUPS.map((name) => ({
        name,
        items: filtered.filter((experiment) => experiment.group === name),
      })).filter((group) => group.items.length > 0),
    [filtered],
  )

  const experimentsOpen = !collapsed.has("experiments")
  const projectsOpen = !collapsed.has("projects")
  const linksOpen = !collapsed.has("links")

  const renderGroup = (group: { name: string; items: Experiment[] }) => {
    const isOpen = !collapsed.has(group.name)

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
      {/* Index only. Experiments own their own scrolling. */}
      <SmoothScroll paused={contactOpen} />
      {/* Unmounting is the teardown: the effect cleanup disposes the GPU state. */}
      {!reducedMotion && <FluidVelocityBackground theme={theme} />}
      <div
        className={`${styles.page} ${introPending ? styles.introPending : ""}`}
      >
        <div className={styles.container}>
          <Masthead
            titleCount={titleCount}
            introCount={introCount}
            onContact={() => setContactOpen(true)}
            onSearch={openPalette}
            lockupRef={lockupRef}
            lockupStuck={lockupStuck}
          />

          <div
            ref={controlsRef}
            className={`${styles.controls} ${controlsStuck ? styles.controlsStuck : ""}`}
          >
            <button
              type="button"
              className={styles.controlButton}
              onClick={expandAll}
              disabled={allExpanded}
              aria-label="Expand all"
              title="Expand all"
            >
              <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={collapseAll}
              disabled={allCollapsed}
              aria-label="Collapse all"
              title="Collapse all"
            >
              <ChevronsDownUp size={14} strokeWidth={1.75} aria-hidden />
            </button>

            <span className={styles.controlsRule} aria-hidden="true" />

            {/* Search moved to a dialog, so sort fits inline at every width and
                no longer needs a narrow-screen dropdown. */}
            <button
              type="button"
              className={`${styles.sortButton} ${sort === "date" ? styles.sortButtonActive : ""}`}
              onClick={() => setSort("date")}
            >
              date
            </button>
            <button
              type="button"
              className={`${styles.sortButton} ${sort === "name" ? styles.sortButtonActive : ""}`}
              onClick={() => setSort("name")}
            >
              a–z
            </button>
          </div>

          <main ref={mainRef} className={styles.main}>
            {filteredProjects.length > 0 && (
              <section className={styles.category}>
                <CategoryHeader
                  name="projects"
                  count={filteredProjects.length}
                  open={projectsOpen}
                  onToggle={() => toggleGroup("projects")}
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

          </main>
        </div>
      </div>

      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  )
}

/** Stack tags for a row. Sits below the description so the title row stays the
 *  thing you scan, and the tags are what you check once something catches. */
function TechTags({ tech }: { tech?: string[] }) {
  if (!tech || tech.length === 0) return null

  return (
    <ul className={styles.itemTech}>
      {tech.map((name) => (
        <li key={name} className={styles.itemTechTag}>
          {name}
        </li>
      ))}
    </ul>
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
        <TechTags tech={project.tech} />
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
        <TechTags tech={experiment.tech} />
      </div>
      <span className={styles.itemDate}>{formatDate(experiment.date)}</span>
    </Link>
  )
}
