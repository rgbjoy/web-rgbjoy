import { expect, test } from "bun:test"

import { createMediaQueryStore } from "./useMediaQuery"

test("server defaults minimize the panel and avoid automatic motion before hydration", () => {
  expect(createMediaQueryStore("(min-width: 721px)").getServerSnapshot()).toBe(false)
  expect(createMediaQueryStore("(prefers-reduced-motion: reduce)", true).getServerSnapshot()).toBe(true)
})

test("desktop/mobile snapshots track the breakpoint and clean up their listener", () => {
  let width = 390
  let notifications = 0
  const listeners = new Set<() => void>()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia(query: string) {
        expect(query).toBe("(min-width: 721px)")
        return {
          get matches() { return width >= 721 },
          addEventListener: (_: string, callback: () => void) => listeners.add(callback),
          removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
        }
      },
    },
  })
  try {
    const store = createMediaQueryStore("(min-width: 721px)")
    expect(store.getSnapshot()).toBe(false)
    const unsubscribe = store.subscribe(() => { notifications += 1 })
    width = 720
    expect(store.getSnapshot()).toBe(false)
    width = 721
    for (const listener of listeners) listener()
    expect(store.getSnapshot()).toBe(true)
    expect(notifications).toBe(1)
    width = 1440
    expect(store.getSnapshot()).toBe(true)
    unsubscribe()
    expect(listeners.size).toBe(0)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
  }
})
