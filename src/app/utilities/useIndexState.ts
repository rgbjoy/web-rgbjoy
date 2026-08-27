"use client"

import { useSyncExternalStore } from "react"

export type SortMode = "date" | "name"

export const SORT_MODES: SortMode[] = ["date", "name"]

/**
 * What the visitor had open, held outside React so back-navigation returns them
 * to their place rather than a freshly collapsed index.
 *
 * Two layers do that. The module-level value survives a client-side route change
 * on its own, since the module stays loaded; sessionStorage covers a full reload.
 * Session scope for the same reason the intro uses it — this should follow a
 * visit, not haunt the next one.
 */
const STORAGE_KEY = "rgbjoy:index-state"

type IndexState = {
  collapsed: Set<string>
  sort: SortMode
}

type StoredState = {
  collapsed: string[]
  sort: SortMode
}

/** Server render and first hydration both see this exact object. */
let defaults: IndexState = {
  collapsed: new Set(),
  sort: "date",
}

let state: IndexState = defaults
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

function getSnapshot(): IndexState {
  return state
}

function getServerSnapshot(): IndexState {
  return defaults
}

function persist() {
  try {
    const stored: StoredState = {
      collapsed: [...state.collapsed],
      sort: state.sort,
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Losing the restore point is not worth breaking the page over.
  }
}

function restore(): IndexState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null

    const { collapsed, sort } = parsed as Partial<StoredState>
    // Storage is writable by anything on the origin, so nothing here is trusted:
    // a bad shape restores as though nothing had been saved.
    if (
      !Array.isArray(collapsed) ||
      !collapsed.every((name) => typeof name === "string")
    ) {
      return null
    }

    return {
      collapsed: new Set(collapsed),
      sort: SORT_MODES.includes(sort as SortMode) ? (sort as SortMode) : "date",
    }
  } catch {
    return null
  }
}

/**
 * Seeds the collapsed set for a first visit. Called from the page, which owns
 * the list of group names — this module should not have to know them.
 */
export function seedCollapsed(names: string[]) {
  if (seeded) return
  seeded = true

  everyName = names
  defaults = { ...defaults, collapsed: new Set(names) }
  // A restored session wins; only a genuinely new one starts fully collapsed.
  state = restore() ?? defaults
  emit()
}

let seeded = false
/** Kept so collapseAll knows what "all" is without the page passing it back. */
let everyName: string[] = []

export function setSort(sort: SortMode) {
  state = { ...state, sort }
  persist()
  emit()
}

export function expandAll() {
  state = { ...state, collapsed: new Set() }
  persist()
  emit()
}

export function collapseAll() {
  state = { ...state, collapsed: new Set(everyName) }
  persist()
  emit()
}

export function toggleCollapsed(name: string) {
  const collapsed = new Set(state.collapsed)
  if (collapsed.has(name)) collapsed.delete(name)
  else collapsed.add(name)

  state = { ...state, collapsed }
  persist()
  emit()
}

export function useIndexState(): IndexState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
