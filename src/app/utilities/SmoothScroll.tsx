"use client"

import gsap from "gsap"
import Lenis from "lenis"
import { useEffect, useRef } from "react"

import { useReducedMotion } from "./settings/useSettings"

/**
 * Smooth scrolling for the index only — mounted from the page, never the layout,
 * so the experiments keep whatever scroll behaviour they define for themselves.
 *
 * Renders nothing; it exists to own the Lenis lifecycle.
 */
export function SmoothScroll({ paused = false }: { paused?: boolean }) {
  const reducedMotion = useReducedMotion()
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    // Hijacked scrolling is exactly what reduced motion asks us not to do, so
    // this stays entirely uninitialised rather than initialised and idle.
    if (reducedMotion) return

    const lenis = new Lenis({
      duration: 1.05,
      // Touch devices already have momentum scrolling people know the feel of.
      // Overriding it is where Lenis tends to fight iOS rather than help it.
      smoothWheel: true,
      syncTouch: false,
    })
    lenisRef.current = lenis

    // GSAP already runs a ticker for the intro, so Lenis rides that instead of
    // opening a second rAF loop beside it and the background sim.
    const drive = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(drive)

    return () => {
      gsap.ticker.remove(drive)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [reducedMotion])

  // Radix locks the body when the contact dialog opens, but Lenis drives scroll
  // itself, so without this the index still scrolls behind the modal.
  useEffect(() => {
    const lenis = lenisRef.current
    if (!lenis) return

    if (paused) lenis.stop()
    else lenis.start()
  }, [paused])

  return null
}
