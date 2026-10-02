'use client'

import { useSyncExternalStore } from 'react'

const TOUCH_QUERY = '(max-width: 640px), (any-pointer: coarse), (hover: none)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(TOUCH_QUERY).matches
const getServerSnapshot = () => false

export function useTouchSelection() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
