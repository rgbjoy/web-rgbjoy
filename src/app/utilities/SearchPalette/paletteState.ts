"use client"

import { useSyncExternalStore } from "react"

/**
 * Open state lives outside the component because two very different things open
 * it: the global Cmd/Ctrl+F handler inside the palette, and the settings menu
 * over in the page. A module store lets both reach it without threading a prop
 * through the layout.
 */
let open = false
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

export function openPalette() {
  if (open) return
  open = true
  emit()
}

export function closePalette() {
  if (!open) return
  open = false
  emit()
}

export function togglePalette() {
  open = !open
  emit()
}

const serverSnapshot = () => false

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, serverSnapshot)
}
