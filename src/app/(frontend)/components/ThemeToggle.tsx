'use client'

import { useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import styles from './themeToggle.module.scss'

// useSyncExternalStore is the React-recommended way to handle client-only rendering
const emptySubscribe = () => () => {}
const useIsMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true, // Client always returns true
    () => false, // Server always returns false
  )

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const mounted = useIsMounted()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={styles.themeToggle}
      aria-label={
        mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Switch theme'
      }
      suppressHydrationWarning
    >
      {mounted ? (
        theme === 'dark' ? (
          <Sun size={20} />
        ) : (
          <Moon size={20} />
        )
      ) : (
        <div style={{ width: 20, height: 20 }} />
      )}
    </button>
  )
}
