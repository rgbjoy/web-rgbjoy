"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { SITE } from "../data/site"
import pageStyles from "../page.module.css"
import { AiPromptDialog } from "./AskAboutWork/AiPromptDialog"
import brandStyles from "./Brand.module.css"
import { ContactDialog } from "./contact/ContactDialog"
import { HoloBackground } from "./HoloBackground"
import { holdVirtualScroll, scrollToTop, setScrollerPaused, virtualScrollY } from "./scrollShift"
import { openPalette } from "./SearchPalette/paletteState"
import { SettingsMenu } from "./settings/SettingsMenu"
import { useReducedMotion } from "./settings/useSettings"
import styles from "./SiteShell.module.css"
import { SmileIcon } from "./SmileIcon"

type ShellHandlers = {
  onContact?: () => void
  /** The menu is opening the AI prompt popup; put away any prompt of the page's own. */
  onAiPrompt?: () => void
}

type SiteShellContextValue = {
  setSimulation: (active: boolean) => void
  setTitleCount: (count: number | null) => void
  registerHandlers: (handlers: ShellHandlers) => () => void
}

const CHAR_SEEDS = ["var(--seed-r)", "var(--seed-g)", "var(--seed-b)"]

/** Long enough to cover the router's reset to the top and the index's restore
 *  of its own position a few frames later; scrolling ends it sooner. */
const ROUTE_SCROLL_HOLD_MS = 800

function makeSeeds(count: number): string[] {
  return Array.from(
    { length: count },
    () => CHAR_SEEDS[Math.floor(Math.random() * CHAR_SEEDS.length)],
  )
}

const SiteShellContext = createContext<SiteShellContextValue>({
  setSimulation: () => {},
  setTitleCount: () => {},
  registerHandlers: () => () => {},
})

export function useSiteShell() {
  return useContext(SiteShellContext)
}

/** The wash and top bar stay mounted when switching between home and studio. */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const shared = pathname === "/" || pathname === "/studio"
  const onHome = pathname === "/"
  const reduced = useReducedMotion()

  const [simulation, setSimulation] = useState(false)
  const inSimulation = onHome && simulation

  const lockupRef = useRef<HTMLElement>(null)
  const [lockupStuck, setLockupStuck] = useState(false)

  // Only type the wordmark on a fresh entry to home; arriving on studio first
  // (or returning to home) keeps the header title steady without wiping it.
  const [titleCount, setTitleCountState] = useState<number | null>(() => (onHome ? 0 : null))
  const brandRevealedRef = useRef(!onHome)
  const [titleSeeds] = useState(() => makeSeeds(SITE.name.length))

  const handlersRef = useRef<ShellHandlers>({})
  const [fallbackContactOpen, setFallbackContactOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  // The shell's dialogs belong to the page they opened on. The shell outlives
  // the route, so close them on any route change — including a history swipe
  // that never reaches the dialog's own dismiss handling.
  const [dialogsPath, setDialogsPath] = useState(pathname)
  if (dialogsPath !== pathname) {
    setDialogsPath(pathname)
    setFallbackContactOpen(false)
    setPromptOpen(false)
  }

  // Lenis drives home's scroll itself, so the index would keep scrolling
  // behind the popup without this.
  useEffect(() => {
    if (!promptOpen) return
    setScrollerPaused(true)
    return () => setScrollerPaused(false)
  }, [promptOpen])

  // The background stays mounted across home and studio, but the router resets
  // scroll on the way in and home puts its own back: hold the wash still
  // through both so it doesn't snap and churn behind the fade.
  const routeRef = useRef(pathname)
  useLayoutEffect(() => {
    if (routeRef.current === pathname) return
    routeRef.current = pathname
    if (!shared) return
    return holdVirtualScroll(ROUTE_SCROLL_HOLD_MS)
  }, [pathname, shared])

  const setTitleCount = useCallback((count: number | null) => {
    if (count === null) {
      brandRevealedRef.current = true
      setTitleCountState(null)
      return
    }
    if (count >= SITE.name.length) {
      brandRevealedRef.current = true
    } else if (brandRevealedRef.current) {
      return
    }
    setTitleCountState(count)
  }, [])

  const registerHandlers = useCallback((handlers: ShellHandlers) => {
    handlersRef.current = handlers
    return () => {
      if (handlersRef.current === handlers) handlersRef.current = {}
    }
  }, [])

  // Measure when the sticky lockup reaches the top edge, matching the index's
  // scroll-driven glass capsule across both views.
  useEffect(() => {
    if (!onHome) brandRevealedRef.current = true
    let frame = 0

    const measure = () => {
      frame = 0
      if (!onHome) setTitleCountState(null)
      const lockup = lockupRef.current
      setLockupStuck(Boolean(shared && lockup && lockup.getBoundingClientRect().top <= 0))
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }

    schedule()
    if (!shared) return () => { if (frame) window.cancelAnimationFrame(frame) }

    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [shared, onHome, pathname])

  const handleContact = useCallback(() => {
    if (handlersRef.current.onContact) handlersRef.current.onContact()
    else setFallbackContactOpen(true)
  }, [])

  // The menu's AI prompt is always the popup, on every page.
  const handleAiPrompt = useCallback(() => {
    handlersRef.current.onAiPrompt?.()
    setPromptOpen(true)
  }, [])

  const contextValue = useMemo<SiteShellContextValue>(
    () => ({ setSimulation, setTitleCount, registerHandlers }),
    [setTitleCount, registerHandlers],
  )

  // While it types, the visible letters are hidden from assistive tech and the
  // full name sits beside them, so the link and h1 are named from the first
  // server render rather than once the intro reaches them.
  const wordmarkText =
    onHome && titleCount !== null ? (
      <>
        <span className={styles.srOnly}>{SITE.name}</span>
        <span aria-hidden="true">
          {Array.from(SITE.name.slice(0, titleCount), (character, index) => (
            <span
              key={index}
              className={pageStyles.typedChar}
              style={{ "--char-seed": titleSeeds[index] } as CSSProperties}
            >
              {character}
            </span>
          ))}
        </span>
      </>
    ) : (
      SITE.name
    )

  // One element tree for every route: only the header, background and dialogs
  // switch on and off, so moving to or from an experiment keeps the route tree
  // under [data-site-content] instead of remounting it under a new parent.
  return (
    <SiteShellContext.Provider value={contextValue}>
      {shared && <HoloBackground scroll={virtualScrollY} still={reduced} simulation={inSimulation} />}
      <div
        className={shared ? styles.shell : styles.passthrough}
        data-shared-site={shared || undefined}
      >
        {shared && (
          <nav
            ref={lockupRef}
            aria-label="Site"
            data-site-header
            className={`${pageStyles.lockup} ${styles.header} ${lockupStuck ? `${pageStyles.lockupStuck} ${styles.headerStuck}` : ""} ${inSimulation ? styles.headerHidden : ""}`}
            aria-hidden={inSimulation || undefined}
            inert={inSimulation || undefined}
          >
            <Link
              href="/"
              className={`${brandStyles.brand} ${styles.brandLink}`}
              aria-current={onHome ? "page" : undefined}
              onClick={(event) => {
                // Modified clicks keep their default: a new tab or window of home.
                if (
                  !onHome ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return
                }
                event.preventDefault()
                scrollToTop(reduced)
              }}
            >
              <span className={brandStyles.mark}>
                <SmileIcon size={34} />
              </span>
              {onHome ? (
                <h1 className={brandStyles.wordmark}>{wordmarkText}</h1>
              ) : (
                <span className={brandStyles.wordmark}>{wordmarkText}</span>
              )}
            </Link>
            <div className={pageStyles.lockupActions}>
              {/* The same palette as the menu and ⌘F, named where it can be seen. */}
              <button type="button" className={pageStyles.lockupSearch} onClick={openPalette}>
                Search
                <span className={pageStyles.lockupHint} aria-hidden="true">⌘F</span>
              </button>
              {/* Deliberately outside the intro timeline: someone who needs reduced
                  motion should not have to sit through an animation to reach it. */}
              <SettingsMenu onContact={handleContact} onSearch={openPalette} onAiPrompt={handleAiPrompt} />
            </div>
          </nav>
        )}
        <div data-site-content>{children}</div>
      </div>
      {shared && <AiPromptDialog open={promptOpen} onOpenChange={setPromptOpen} />}
      {shared && <ContactDialog open={fallbackContactOpen} onOpenChange={setFallbackContactOpen} />}
    </SiteShellContext.Provider>
  )
}

/** Home still owns the simulation controls; the shell owns its canvas. */
export function SimulationBackground({ active }: { active: boolean }) {
  const { setSimulation } = useSiteShell()
  useEffect(() => {
    setSimulation(active)
    return () => setSimulation(false)
  }, [active, setSimulation])
  return null
}
