"use client"

import { useSyncExternalStore } from "react"

import { MOTION_KEY, THEME_KEY, type Motion, type Theme } from "./constants"

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

/**
 * The <html> attributes set by SETTINGS_BOOT_SCRIPT are the single source of
 * truth: CSS already reads them, so keeping React state alongside would just be
 * a second copy to drift. useSyncExternalStore reads them directly instead.
 */
let listeners: Array<() => void> = []

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null
  }
}

function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A setting that cannot be remembered still applies for this visit.
  }
}

function themeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

function motionSnapshot(): Motion {
  return document.documentElement.dataset.motion === "reduced"
    ? "reduced"
    : "full"
}

// Server render has no DOM to read, and matches the boot script's defaults.
const serverTheme = (): Theme => "dark"
const serverMotion = (): Motion => "full"

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next
  persist(THEME_KEY, next)
  emit()
}

export function setMotion(next: Motion) {
  document.documentElement.dataset.motion = next
  persist(MOTION_KEY, next)
  emit()
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, themeSnapshot, serverTheme)
}

export function useMotion(): Motion {
  return useSyncExternalStore(subscribe, motionSnapshot, serverMotion)
}

export function useReducedMotion(): boolean {
  return useMotion() === "reduced"
}

// Track the OS setting for as long as the visitor has not overridden it.
if (typeof window !== "undefined") {
  window.matchMedia(REDUCED_QUERY).addEventListener("change", (event) => {
    const choice = stored(MOTION_KEY)
    if (choice === "reduced" || choice === "full") return
    document.documentElement.dataset.motion = event.matches ? "reduced" : "full"
    emit()
  })
}
