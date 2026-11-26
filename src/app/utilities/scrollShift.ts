import type Lenis from "lenis"

/**
 * Moves the page without it reading as motion. Two things need that: the
 * endless index, which jumps back one whole cycle once the visitor is into the
 * next copy, and a description opening above the viewport, whose growth is paid
 * back so nothing on screen moves.
 *
 * Lenis keeps its own idea of where the page is — a target, an animated value
 * and the tween between them. Setting window scroll alone would let its next
 * frame drag the page back, or drop the rest of a wheel fling. So every one of
 * those values moves by the same amount, and the fling carries on from the new
 * place as though nothing happened.
 */

type LenisTween = { from: number; to: number; value: number }

let lenis: Lenis | null = null
/** Sum of every shift, so position plus offset never jumps. */
let offset = 0

export function registerScroller(instance: Lenis | null) {
  lenis = instance
}

/** True while Lenis is easing toward a wheel target, so a shift is invisible
 *  right now. Native scrolling (touch, keys, the scrollbar) is better left
 *  alone until it settles: moving it mid-gesture can stop iOS momentum dead. */
export function isSmoothScrolling(): boolean {
  return lenis?.isScrolling === "smooth"
}

export function shiftScroll(delta: number) {
  if (!delta) return
  offset -= delta

  if (lenis) {
    lenis.animatedScroll += delta
    lenis.targetScroll += delta
    // Private in the typings, but it is the tween that writes animatedScroll on
    // the next frame — leaving it behind undoes the shift.
    const tween = (lenis as unknown as { animate?: LenisTween }).animate
    if (tween) {
      tween.from += delta
      tween.to += delta
      tween.value += delta
    }
    window.scrollTo({ top: lenis.animatedScroll, behavior: "instant" })
    return
  }

  window.scrollTo({ top: window.scrollY + delta, behavior: "instant" })
}

/** The last position handed out, so a hold can keep the background on it. */
let lastVirtual: number | null = null
let holding = false

/** Scroll position with every shift added back: continuous across wraps, so
 *  anything keyed to it — the background — never sees the jump. */
export function virtualScrollY(): number {
  const y = window.scrollY
  if (holding && lastVirtual !== null) offset = lastVirtual - y
  lastVirtual = y + offset
  return lastVirtual
}

const HOLD_RELEASE_EVENTS = ["wheel", "touchstart", "keydown"] as const

/**
 * A route change resets scroll to the top and the page arriving may restore its
 * own position a few frames later. To the background both are jumps, not
 * movement, so the virtual position holds still through them: every raw change
 * goes into the offset until the visitor scrolls or `ms` passes. Returns the
 * release, for cleanup.
 */
export function holdVirtualScroll(ms: number): () => void {
  holding = true
  // Follows scroll events as well as reads, so the offset is rebased even when
  // nothing reads it during the hold (a still background stops its loop).
  const follow = () => {
    virtualScrollY()
  }
  const release = () => {
    holding = false
    window.clearTimeout(timer)
    window.removeEventListener("scroll", follow)
    for (const type of HOLD_RELEASE_EVENTS) window.removeEventListener(type, release)
  }
  follow()
  const timer = window.setTimeout(release, ms)
  window.addEventListener("scroll", follow, { passive: true })
  for (const type of HOLD_RELEASE_EVENTS) {
    window.addEventListener(type, release, { passive: true })
  }
  return release
}

/** Stops smooth scrolling under a modal opened from outside the page that owns
 *  it: Radix's scroll lock stops the native page, but Lenis drives its own. */
export function setScrollerPaused(paused: boolean) {
  if (!lenis) return
  if (paused) lenis.stop()
  else lenis.start()
}

export function scrollToTop(immediate: boolean) {
  if (lenis) {
    lenis.scrollTo(0, { immediate })
    return
  }
  window.scrollTo({ top: 0, behavior: immediate ? "auto" : "smooth" })
}
