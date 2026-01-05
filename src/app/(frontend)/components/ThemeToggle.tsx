'use client'

import { useRef, useEffect, useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'
import gsap from 'gsap'
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
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (mounted && buttonRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, delay: 1, ease: 'power2.out' },
      )
    }
  }, [mounted])

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      className={styles.themeToggle}
      style={{ opacity: 0 }}
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
