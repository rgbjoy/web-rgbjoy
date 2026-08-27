"use client"

import { useEffect } from "react"

const SEEDS = ["var(--seed-r)", "var(--seed-g)", "var(--seed-b)"]

/** Anything that reacts to a rollover. Radix menu items are divs with roles. */
const INTERACTIVE =
  'a, button, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'

/**
 * Steps every rollover through red, green, blue in order.
 *
 * The counter is module-level, not per-element, so the cycle advances across the
 * whole page: consecutive rollovers are always different colours, which random
 * picks could not guarantee — they repeated roughly a third of the time.
 *
 * CSS cannot do this alone, so the colour arrives as an inline custom property
 * and the hover rules read it — `var(--rollover-seed, <original>)`, so anything
 * not covered here still styles itself exactly as before.
 *
 * Renders nothing; delegation from the document means no per-element handlers.
 */
let cursor = 0

export function RolloverChroma() {
  useEffect(() => {
    const advance = (target: Element) => {
      const seed = SEEDS[cursor % SEEDS.length]
      cursor += 1
      ;(target as HTMLElement).style.setProperty("--rollover-seed", seed)
    }

    const onOver = (event: PointerEvent | FocusEvent) => {
      const node = event.target
      if (!(node instanceof Element)) return

      const target = node.closest(INTERACTIVE)
      if (!target) return

      // pointerover re-fires while crossing descendants. Without this the cycle
      // would advance as the pointer moved within a single row, which reads as a
      // flicker rather than a rollover.
      const from = (event as PointerEvent).relatedTarget
      if (from instanceof Node && target.contains(from)) return

      advance(target)
    }

    document.addEventListener("pointerover", onOver)
    document.addEventListener("focusin", onOver)

    return () => {
      document.removeEventListener("pointerover", onOver)
      document.removeEventListener("focusin", onOver)
    }
  }, [])

  return null
}
