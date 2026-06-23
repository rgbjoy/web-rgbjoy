'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

let lenis: Lenis | null = null

export function getLenis() {
  return lenis
}

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const instance = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
    })

    lenis = instance

    let frame = 0
    const raf = (time: number) => {
      instance.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      instance.destroy()
      lenis = null
    }
  }, [])

  return null
}
