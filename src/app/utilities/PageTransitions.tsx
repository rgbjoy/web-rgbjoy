"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useReducedMotion } from "./settings/useSettings"

/** Fade between the portfolio and studio, preserving normal browser link gestures. */
export function PageTransitions() {
  const pathname = usePathname()
  const router = useRouter()
  const reduced = useReducedMotion()
  const pending = useRef(false)
  const animation = useRef<Animation | null>(null)

  useEffect(() => {
    pending.current = false
    animation.current?.cancel()
    if (!reduced) {
      animation.current = document.body.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 240, easing: "ease-out",
      })
    }
    return () => animation.current?.cancel()
  }, [pathname, reduced])

  useEffect(() => {
    let disposed = false
    let recovery: ReturnType<typeof setTimeout> | undefined
    function click(event: MouseEvent) {
      if (reduced || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest("a") : null
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin || url.pathname === pathname || !["/", "/studio"].includes(pathname) || !["/", "/studio"].includes(url.pathname)) return
      event.preventDefault()
      event.stopPropagation()
      if (pending.current) return
      pending.current = true
      animation.current?.cancel()
      const fade = document.body.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180, easing: "ease-in", fill: "forwards",
      })
      animation.current = fade
      void fade.finished.then(() => {
        if (disposed) return
        router.push(url.pathname + url.search + url.hash)
        // Restore visibility if navigation fails or stalls.
        recovery = setTimeout(() => {
          fade.cancel()
          pending.current = false
        }, 4000)
      }).catch(() => { pending.current = false })
    }
    document.addEventListener("click", click, true)
    return () => {
      disposed = true
      clearTimeout(recovery)
      document.removeEventListener("click", click, true)
    }
  }, [pathname, reduced, router])

  return null
}
