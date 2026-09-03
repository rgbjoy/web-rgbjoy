import { useMemo, useSyncExternalStore } from "react"

export function createMediaQueryStore(query: string, serverMatches = false) {
  return {
    subscribe(onChange: () => void) {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    getSnapshot: () => window.matchMedia(query).matches,
    getServerSnapshot: () => serverMatches,
  }
}

export function useMediaQuery(query: string, serverMatches = false) {
  const store = useMemo(() => createMediaQueryStore(query, serverMatches), [query, serverMatches])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}
