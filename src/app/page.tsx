"use client"

import { usePortfolio, useInfo, type PortfolioProject } from "./utilities/PortfolioProvider"
import gsap from "gsap"
import { infoDocument, infoText } from "./data/info-document"
import { InfoBody } from "./utilities/InfoBody"
import { ArrowUpRight, Minus, Plus, X } from "lucide-react"
import Link from "next/link"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { flushSync } from "react-dom"

import type { Experiment } from "./data/experiments"
import { LINKS, type SiteLink } from "./data/links"
import { SITE } from "./data/site"
import { AskAboutWork } from "./utilities/AskAboutWork/AskAboutWork"
import { useDismissed } from "./utilities/useDismissed"
import { ContactDialog } from "./utilities/contact/ContactDialog"
import { HoloBackground } from "./utilities/HoloBackground"
import { openPalette } from "./utilities/SearchPalette/paletteState"
import { SettingsMenu } from "./utilities/settings/SettingsMenu"
import { RgbLogo } from "./utilities/RgbLogo/RgbLogo"
import { isSmoothScrolling, shiftScroll, virtualScrollY } from "./utilities/scrollShift"
import { SmoothScroll } from "./utilities/SmoothScroll"
import { useReducedMotion } from "./utilities/settings/useSettings"
import styles from "./page.module.css"

// Keep the automatic AI prompt off small screens, including the first paint.
const desktopPromptQuery = '(min-width: 641px)'
function subscribeDesktopPrompt(callback: () => void) {
  const media = window.matchMedia(desktopPromptQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const desktopPromptSnapshot = () => window.matchMedia(desktopPromptQuery).matches
const serverPromptSnapshot = () => false

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

const TITLE_TEXT = SITE.name
function introText(info: ReturnType<typeof useInfo>) {
  return { INTRO_TOTAL: infoText(infoDocument(info).root).length }
}

/** ~ms per character, before INTRO_TIME_SCALE. The title is short, so it types
 *  slower than the body to read as a reveal rather than a flash. */
const TITLE_CHAR_MS = 84
const INTRO_CHAR_MS = 16
/** Whole intro timeline runs at this multiple of real time. */
const INTRO_TIME_SCALE = 3
/** Beat of stillness before the intro starts typing. Real seconds — a timeline's
 *  own delay sits on the parent timeline, so INTRO_TIME_SCALE does not shrink it. */
const INTRO_DELAY_S = 0.35
/** Longest the intro waits on the masthead face before typing in the fallback. */
const TITLE_FONT_WAIT_MS = 1500
/**
 * The intro is a greeting, not a page transition: arriving should play it,
 * coming back should not. Back-navigation remounts this component, which
 * replayed the whole timeline — and until it finished the list was hidden and
 * the title empty, so the page read as frozen.
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

/**
 * Index scroll position across a trip into an experiment and back. Module state
 * covers soft client navigations; sessionStorage covers a hard back/forward
 * where the module reloads. Tracked while scrolling and saved before leaving;
 * cleanup persists that snapshot instead of reading the experiment's offset.
 */
const INDEX_SCROLL_KEY = "rgbjoy:index-scroll"
let rememberedIndexScroll = 0

function rememberIndexScroll(y = window.scrollY) {
  rememberedIndexScroll = y
  try {
    window.sessionStorage.setItem(
      INDEX_SCROLL_KEY,
      String(rememberedIndexScroll),
    )
  } catch {
    // Scroll restore is a nicety; storage can be unavailable.
  }
}

function readRememberedIndexScroll(): number {
  if (rememberedIndexScroll > 0) return rememberedIndexScroll
  try {
    const raw = window.sessionStorage.getItem(INDEX_SCROLL_KEY)
    if (raw == null) return 0
    const y = Number(raw)
    return Number.isFinite(y) && y > 0 ? y : 0
  } catch {
    return 0
  }
}

/**
 * The index never ends: it is rendered as a run of identical copies, and once
 * the visitor is into the second, the page jumps back exactly one copy. Same
 * content, same place on screen, so the jump cannot be seen.
 *
 * The server sends one copy, which is a complete page on its own; the rest are
 * added before the first client paint. Three covers a hard touch fling, which
 * is left to land before the page is moved (see scrollShift), and more are
 * added if one copy is ever shorter than the viewport.
 */
const MIN_COPIES = 3
/** Quiet time after a native scroll before it is safe to wrap. */
const LOOP_IDLE_MS = 140

/** False on the server and through hydration, true after. */
const subscribeNothing = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

/**
 * Which descriptions are open, by row, shared by every copy. A row opened in
 * one copy has to be open in all of them, or the wrap would land on a twin
 * that is a different height and visibly jump.
 */
let expandedRows: ReadonlySet<string> = new Set()
const expandedListeners = new Set<() => void>()

function subscribeExpanded(listener: () => void) {
  expandedListeners.add(listener)
  return () => {
    expandedListeners.delete(listener)
  }
}

const expandedSnapshot = () => expandedRows

function toggleExpanded(key: string) {
  const next = new Set(expandedRows)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedRows = next
  for (const listener of expandedListeners) listener()
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

/** A rule, a label and an optional count: the head of every block. */
function BlockHead({
  label,
  count,
  as: Heading = "h2",
}: {
  label: string
  count?: number
  as?: "h2" | "span"
}) {
  return (
    <div className={styles.blockHead}>
      <span className={styles.rule} data-intro="rule" aria-hidden="true" />
      <Heading className={styles.label} data-intro="label">
        {label}
      </Heading>
      {count != null && (
        <span className={styles.count} data-intro="label">
          {pad2(count)}
        </span>
      )}
    </div>
  )
}

function Masthead({
  titleCount,
  introCount,
  onContact,
  onSearch,
  onAiPrompt,
  lockupRef,
  lockupStuck,
  mastheadRef,
}: {
  titleCount: number
  introCount: number
  onContact: () => void
  onSearch: () => void
  onAiPrompt: () => void
  lockupRef: React.RefObject<HTMLDivElement | null>
  lockupStuck: boolean
  mastheadRef: React.RefObject<HTMLElement | null>
}) {
  const info = useInfo()
  const { INTRO_TOTAL } = introText(info)
  const document = infoDocument(info)
  // Held in state so a re-render never reshuffles a character mid-fade. The
  // server renders no characters (counts start at 0), so the randomness here
  // cannot desync hydration.
  const [titleSeeds] = useState(() => makeSeeds(TITLE_TEXT.length))
  const [introSeeds] = useState(() => makeSeeds(INTRO_TOTAL))

  return (
    <>
      {/* A sibling of the list, not a child of the header — a sticky element
          only stays pinned while its own parent is in view, and the header
          scrolls away with the intro. */}
      <div
        ref={lockupRef}
        className={`${styles.lockup} ${lockupStuck ? styles.lockupStuck : ""}`}
      >
        {/* Wrapped so the lockup's space-between still has two children to
            push apart, with the mark travelling alongside the title. */}
        <div className={styles.brand}>
          <RgbLogo />
          <h1 className={styles.title}>
            <TypedText
              text={TITLE_TEXT.slice(0, titleCount)}
              seeds={titleSeeds}
            />
          </h1>
        </div>
        <div className={styles.lockupActions}>
          {/* The same palette as the menu and ⌘F, named where it can be seen. */}
          <button type="button" className={styles.lockupSearch} onClick={onSearch}>
            Search
            <span className={styles.lockupHint} aria-hidden="true">⌘F</span>
          </button>
          {/* Deliberately outside the intro timeline: someone who needs reduced
              motion should not have to sit through an animation to reach it. */}
          <SettingsMenu onContact={onContact} onSearch={onSearch} onAiPrompt={onAiPrompt} />
        </div>
      </div>

      <header ref={mastheadRef} className={styles.masthead}>
        <BlockHead label="About" as="span" />
        <div className={styles.split}>
          <div className={styles.splitMain}>
            <div className={styles.intro}>
              <div className={styles.introMeasure} aria-hidden="true" inert>
                <InfoBody node={document.root} linkClass={styles.introLink} />
              </div>
              <div className={styles.introLive}>
                <InfoBody node={document.root} count={introCount} onContact={onContact} linkClass={styles.introLink}
                  renderText={(text, offset) => <TypedText text={text} seeds={introSeeds} offset={offset} />} />
              </div>
            </div>
            {/* Fades in right after the intro has typed out; the load choreography finds it by data-intro. */}
            <Link href="/studio" className={styles.pill} data-intro="studio">
              Learn about the studio
            </Link>
          </div>
        </div>
      </header>
    </>
  )
}

export default function Home() {
  const info = useInfo()
  const { INTRO_TOTAL } = introText(info)
  const availableForWork = Boolean(info.available_for_work)
  const { projects, experiments } = usePortfolio()
  const availabilityRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const mastheadRef = useRef<HTMLElement>(null)
  const lockupRef = useRef<HTMLDivElement>(null)
  const [lockupStuck, setLockupStuck] = useState(false)
  const introPlayedRef = useRef(false)
  // Fixed for this mount: a return trip skips the intro so scroll can restore
  // against the finished page; a first visit plays it.
  const [resumeVisit] = useState(shouldSkipIntro)
  const [contactOpen, setContactOpen] = useState(false)
  // Each pill stays closed for a day once its close button is pressed.
  const [availabilityDismissed, dismissAvailability] = useDismissed("rgbjoy:availability-dismissed")
  const [promptDismissed, dismissPrompt] = useDismissed("rgbjoy:prompt-dismissed")
  const desktopPrompt = useSyncExternalStore(subscribeDesktopPrompt, desktopPromptSnapshot, serverPromptSnapshot)
  const [promptOverride, setPromptOpen] = useState<boolean | null>(null)
  // The menu can still open it after it's been closed.
  const promptOpen = promptOverride ?? (desktopPrompt && !promptDismissed)
  const reducedMotion = useReducedMotion()
  const [titleCount, setTitleCount] = useState(
    resumeVisit ? TITLE_TEXT.length : 0,
  )
  const [introCount, setIntroCount] = useState(resumeVisit ? INTRO_TOTAL : 0)
  const [introPending, setIntroPending] = useState(!resumeVisit)
  // One on the server, so the HTML is a single complete index; the rest of
  // the loop arrives right after hydration, far below the fold.
  const hydrated = useSyncExternalStore(subscribeNothing, clientSnapshot, serverSnapshot)
  const [fitCopies, setFitCopies] = useState(MIN_COPIES)
  const copyCount = hydrated ? fitCopies : 1
  const restoredRef = useRef(false)

  // Newest first. Stable, so projects from the same year keep the order the
  // dashboard gives them.
  const orderedProjects = useMemo(
    () => projects.slice().sort((a, b) => b.year.localeCompare(a.year)),
    [projects],
  )

  // Load choreography: title → about → intro → studio → each block of the
  // first copy (rule, label, rows). The other copies sit below the fold.
  useLayoutEffect(() => {
    const main = mainRef.current
    const masthead = mastheadRef.current
    const availability = availabilityRef.current
    const studioLink = masthead?.querySelector<HTMLElement>('[data-intro="studio"]') ?? null
    if (!main || !masthead) return

    // Toggling the setting re-runs this, and back-navigation remounts it. Either
    // way, snap to the finished state rather than replaying the intro at someone
    // who has already read it.
    if (reducedMotion || introPlayedRef.current || resumeVisit || shouldSkipIntro()) {
      introPlayedRef.current = true
      markIntroPlayed()
      setTitleCount(TITLE_TEXT.length)
      setIntroCount(INTRO_TOTAL)
      setIntroPending(false)
      return
    }

    const blockParts = (block: Element) => ({
      rule: block.querySelector<HTMLElement>('[data-intro="rule"]'),
      labels: Array.from(block.querySelectorAll<HTMLElement>('[data-intro="label"]')),
      rows: Array.from(block.querySelectorAll<HTMLElement>('[data-intro="row"]')),
    })
    const about = blockParts(masthead)
    const firstCopy = main.querySelector('[data-loop-copy="0"]')
    const blocks = firstCopy
      ? Array.from(firstCopy.querySelectorAll("[data-intro-block]"), blockParts)
      : []

    const rules = [about.rule, ...blocks.map((block) => block.rule)].filter(
      (rule): rule is HTMLElement => rule !== null,
    )
    const faded = [
      ...about.labels,
      ...blocks.flatMap((block) => block.labels),
      ...(studioLink ? [studioLink] : []),
      ...(availability ? [availability] : []),
    ]
    const rows = blocks.flatMap((block) => block.rows)

    // CSS already hides these; lock matching GSAP state before the timeline runs.
    gsap.set(faded, { autoAlpha: 0 })
    gsap.set(rows, { autoAlpha: 0, y: 10 })
    gsap.set(rules, { scaleX: 0, transformOrigin: "left center" })

    const title = { i: 0 }
    const intro = { i: 0 }
    const timeline = gsap.timeline({
      paused: true,
      delay: INTRO_DELAY_S,
      defaults: { ease: "power2.out" },
      onComplete: () => {
        introPlayedRef.current = true
        markIntroPlayed()
        setIntroPending(false)
      },
    })
    timeline.timeScale(INTRO_TIME_SCALE)

    timeline.to(title, {
      i: TITLE_TEXT.length,
      duration: (TITLE_TEXT.length * TITLE_CHAR_MS) / 1000,
      onUpdate: () => setTitleCount(Math.floor(title.i)),
      onComplete: () => setTitleCount(TITLE_TEXT.length),
    })
    if (about.rule) timeline.to(about.rule, { scaleX: 1, duration: 0.6 })
    if (about.labels.length) timeline.to(about.labels, { autoAlpha: 1, duration: 0.25 }, "<0.1")
    timeline.to(intro, {
      i: INTRO_TOTAL,
      duration: (INTRO_TOTAL * INTRO_CHAR_MS) / 1000,
      onUpdate: () => setIntroCount(Math.floor(intro.i)),
      onComplete: () => setIntroCount(INTRO_TOTAL),
    })
    if (studioLink) timeline.to(studioLink, { autoAlpha: 1, duration: 0.35 }, "+=0.1")

    for (const block of blocks) {
      if (block.rule) timeline.to(block.rule, { scaleX: 1, duration: 0.6 }, "+=0.04")
      if (block.labels.length) timeline.to(block.labels, { autoAlpha: 1, duration: 0.25 }, "<0.1")
      if (block.rows.length) {
        timeline.to(
          block.rows,
          { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.04 },
          "<0.08",
        )
      }
    }

    if (availability) timeline.to(availability, { autoAlpha: 1, duration: 0.9 }, "+=0.15")

    // Hold the typing until the display face is ready; otherwise the headline
    // types in the fallback and visibly swaps partway through.
    let waiting = true
    const start = () => {
      if (!waiting) return
      waiting = false
      timeline.restart(true)
    }
    const fontTimer = window.setTimeout(start, TITLE_FONT_WAIT_MS)
    const heading = lockupRef.current?.querySelector("h1")
    if (heading && document.fonts) {
      const { fontSize, fontFamily } = getComputedStyle(heading)
      document.fonts.load(`${fontSize} ${fontFamily}`, TITLE_TEXT).then(start, start)
    } else start()

    return () => {
      waiting = false
      window.clearTimeout(fontTimer)
      timeline.kill()
      gsap.set([...faded, ...rows], { clearProps: "opacity,visibility,transform" })
      gsap.set(rules, { clearProps: "transform,transformOrigin" })
    }
  }, [reducedMotion, resumeVisit, INTRO_TOTAL, availableForWork])

  // Keep a restore point while the index is up, then put it back once the
  // loop's copies exist, so the page is tall enough to land there.
  useEffect(() => {
    const onScroll = () => {
      // A route change can reset scroll before this page's effect cleans up.
      if (window.location.pathname === "/") rememberedIndexScroll = window.scrollY
    }
    const onHide = () => rememberIndexScroll(rememberedIndexScroll)

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pagehide", onHide)

    return () => {
      rememberIndexScroll(rememberedIndexScroll)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pagehide", onHide)
    }
  }, [])

  useLayoutEffect(() => {
    if (restoredRef.current || introPending || copyCount < 2) return
    if (!resumeVisit && !shouldSkipIntro()) return
    restoredRef.current = true

    const y = readRememberedIndexScroll()
    if (y <= 0) return

    window.scrollTo(0, y)
    // Next may also try to restore (or reset) after this layout pass; a frame
    // later re-asserts the index position once the document height is final.
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, y))
    return () => window.cancelAnimationFrame(frame)
  }, [introPending, resumeVisit, copyCount])

  // The loop itself. Wraps on every frame while Lenis is easing a wheel fling —
  // scrollShift carries the fling across — and otherwise once a native scroll
  // has gone quiet, so touch momentum is never cut off mid-flight.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return

    let idleTimer = 0

    const measure = () => {
      const copies = main.querySelectorAll<HTMLElement>("[data-loop-copy]")
      if (copies.length < 2) return null
      const first = copies[0].getBoundingClientRect().top
      const second = copies[1].getBoundingClientRect().top
      const cycle = second - first
      return cycle > 0 ? { second, cycle } : null
    }

    const wrap = () => {
      window.clearTimeout(idleTimer)
      const loop = measure()
      // Still above the second copy: nothing to do.
      if (!loop || loop.second > 0) return
      const cycles = Math.floor(-loop.second / loop.cycle) + 1
      shiftScroll(-cycles * loop.cycle)
    }

    const onScroll = () => {
      if (isSmoothScrolling()) {
        wrap()
        return
      }
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(wrap, LOOP_IDLE_MS)
    }

    // Enough copies that the viewport plus a fling never reaches the end.
    const fit = () => {
      const loop = measure()
      if (!loop) return
      setFitCopies(Math.max(MIN_COPIES, Math.ceil(window.innerHeight / loop.cycle) + 2))
    }

    const observer = new ResizeObserver(fit)
    observer.observe(main)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("scrollend", wrap)

    return () => {
      window.clearTimeout(idleTimer)
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("scrollend", wrap)
    }
  }, [])

  // The bar is pinned exactly when its own top reaches zero, so read that
  // rather than watching a sentinel: IntersectionObserver never fires here in
  // Chrome, most likely because of the overflow-x: clip on html and body.
  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const lockup = lockupRef.current
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

  return (
    <>
      {/* Index only. Experiments own their own scrolling. */}
      <SmoothScroll paused={contactOpen} />
      {/* Drifts idle and travels with scroll; under reduced motion, one still frame. */}
      <HoloBackground scroll={virtualScrollY} still={reducedMotion} />
      <div
        className={`${styles.page} ${introPending ? styles.introPending : ""}`}
      >
        <div className={styles.container}>
          <Masthead
            titleCount={titleCount}
            introCount={introCount}
            onContact={() => setContactOpen(true)}
            onSearch={openPalette}
            onAiPrompt={() => setPromptOpen(true)}
            lockupRef={lockupRef}
            lockupStuck={lockupStuck}
            mastheadRef={mastheadRef}
          />

          <main ref={mainRef} className={styles.main}>
            {Array.from({ length: copyCount }, (_, index) => (
              <IndexCycle
                key={index}
                index={index}
                projects={orderedProjects}
                experiments={experiments}
                links={LINKS}
              />
            ))}
          </main>
        </div>
        {availableForWork && (
          <div
            ref={availabilityRef}
            className={styles.availability}
            hidden={availabilityDismissed}
            // The AI prompt stacks above this on phones (see its stylesheet).
            data-availability
          >
            <Link href="/studio" className={styles.availabilityAction}>
              <span className={styles.availabilityDot} aria-hidden="true" />
              Available for new work
              <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            <button type="button" className={styles.availabilityClose} onClick={dismissAvailability} aria-label="Dismiss availability message" title="Dismiss">
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {reducedMotion && (
        <p className={`${styles.motionIndicator} ${availableForWork ? styles.motionIndicatorWithAvailability : ""}`}>reduced motion on</p>
      )}

      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
      <AskAboutWork open={promptOpen} onOpenChange={setPromptOpen} onDismiss={dismissPrompt} />
    </>
  )
}

/**
 * One full pass of the index. Every copy after the first is a twin kept for the
 * loop: hidden from assistive tech and out of the tab order, so a screen reader
 * hears the index once and Tab never runs on forever. Still clickable, since a
 * twin is often what is under the pointer.
 */
function IndexCycle({
  index,
  projects,
  experiments,
  links,
}: {
  index: number
  projects: PortfolioProject[]
  experiments: Experiment[]
  links: SiteLink[]
}) {
  const clone = index > 0
  const Footer = clone ? "div" : "footer"

  return (
    <div
      className={styles.cycle}
      data-loop-copy={index}
      aria-hidden={clone || undefined}
    >
      {projects.length > 0 && (
        <section className={styles.block} data-intro-block>
          <BlockHead label="Projects" count={projects.length} />
          {projects.map((project) => (
            <IndexRow
              key={project.href}
              rowKey={project.href}
              clone={clone}
              href={project.href}
              title={project.title}
              note={project.year}
              description={project.description}
              tech={project.tech}
            />
          ))}
        </section>
      )}

      {experiments.length > 0 && (
        <section className={styles.block} data-intro-block>
          <BlockHead label="Experiments" count={experiments.length} />
          {experiments.map((experiment) => (
            <IndexRow
              key={experiment.href}
              rowKey={experiment.href}
              clone={clone}
              href={experiment.href}
              title={experiment.title}
              note={experiment.group}
              description={experiment.description}
              tech={experiment.tech}
            />
          ))}
        </section>
      )}

      {links.length > 0 && (
        <section className={styles.block} data-intro-block>
          <BlockHead label="Links" count={links.length} />
          {links.map((link) => (
            <IndexRow
              key={link.href}
              rowKey={link.href}
              clone={clone}
              href={link.href}
              title={link.title}
              detail={link.href.replace(/^[a-z]+:(\/\/)?(www\.)?/, "").replace(/\/$/, "")}
            />
          ))}
        </section>
      )}

      {/* The seam between one pass and the next. */}
      <Footer className={styles.colophon} data-intro-block>
        <span className={styles.rule} data-intro="rule" aria-hidden="true" />
        <span className={styles.label} data-intro="label">{SITE.name}</span>
        <Link
          href="/directory"
          className={`${styles.label} ${styles.labelLink}`}
          data-intro="label"
          tabIndex={clone ? -1 : undefined}
        >
          Directory &amp; API
        </Link>
      </Footer>
    </div>
  )
}

/** The rows are a box with the title as its link, stretched over the whole
 *  row, so anywhere on it follows the link — while the description's toggle,
 *  which can't sit inside a link, sits above. Off-site links open a new tab;
 *  experiments stay in the app. */
function IndexRow({
  rowKey,
  clone,
  href,
  title,
  note,
  description,
  detail,
  tech,
}: {
  rowKey: string
  clone: boolean
  href: string
  title: string
  /** Set beside the title, small: a project's year, an experiment's group. */
  note?: string
  description?: string
  /** Plain one-line text where a row has no description to open. */
  detail?: string
  tech?: string[]
}) {
  const descriptionId = useId()
  const external = /^[a-z]+:/i.test(href)
  const internal = href.startsWith("/")

  const label = (
    <>
      <span className={styles.rowTitle}>{title}</span>
      {external ? (
        <ArrowUpRight className={styles.rowExternal} size={16} strokeWidth={1.5} aria-hidden />
      ) : null}
      {note ? <span className={styles.rowNote}>{note}</span> : null}
    </>
  )
  const linkProps = {
    className: styles.rowLink,
    "aria-describedby": description ? descriptionId : undefined,
    tabIndex: clone ? -1 : undefined,
  }

  return (
    <div className={styles.row} data-intro="row">
      <div className={styles.rowHead}>
        {internal ? (
          <Link href={href} {...linkProps} onNavigate={() => rememberIndexScroll()}>
            {label}
          </Link>
        ) : (
          // mailto: opens a mail client rather than a tab, so it skips target/rel.
          <a href={href} {...linkProps} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
            {label}
          </a>
        )}
      </div>
      <div className={styles.rowBody}>
        {description ? (
          <Description id={descriptionId} rowKey={rowKey} text={description} clone={clone} />
        ) : detail ? (
          <p className={styles.rowDetail}>{detail}</p>
        ) : null}
        {tech && tech.length > 0 ? (
          <p className={styles.rowTech}>
            {tech.map((name, index) => (
              <span key={name}>
                {index > 0 ? <span className={styles.rowTechSep} aria-hidden="true"> / </span> : null}
                {name}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Roughly what two lines hold at full width; a first guess at whether a
 *  description needs its toggle, before the browser has measured it. */
const CLAMP_GUESS = 160

/** A description held to two lines, with a + for the rest when it runs longer.
 *  The toggle sits above the row's link, so it opens the text instead of
 *  following the link. */
function Description({
  id,
  rowKey,
  text,
  clone,
}: {
  id: string
  rowKey: string
  text: string
  clone: boolean
}) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const open = useSyncExternalStore(subscribeExpanded, expandedSnapshot, expandedSnapshot).has(rowKey)
  const [overflows, setOverflows] = useState(text.length > CLAMP_GUESS)

  // Measured while clamped, and again whenever the width changes: whether
  // the text runs past its two lines decides whether there's anything to open.
  useLayoutEffect(() => {
    const element = textRef.current
    if (!element || open) return
    const observer = new ResizeObserver(() => setOverflows(element.scrollHeight > element.clientHeight + 1))
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, text])

  // Every copy of this row opens together, so the twins above the pressed one
  // grow as well. Pay that growth back in scroll and the button stays put
  // under the pointer, rather than the page sliding away from it.
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    const before = button.getBoundingClientRect().top
    flushSync(() => toggleExpanded(rowKey))
    shiftScroll(button.getBoundingClientRect().top - before)
  }

  return (
    <div className={styles.desc}>
      <p id={id} ref={textRef} className={`${styles.descText} ${open ? "" : styles.descClamped}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? "Show less" : "Show the full description"}
          title={open ? "Show less" : "Show more"}
          tabIndex={clone ? -1 : undefined}
          onClick={toggle}
        >
          {open ? (
            <Minus size={12} strokeWidth={1.75} aria-hidden />
          ) : (
            <Plus size={12} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      )}
    </div>
  )
}
