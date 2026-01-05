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
  const lastScrollY = useRef(0)
  const isVisible = useRef(true)

  // Initial fade in
  useEffect(() => {
    if (mounted && buttonRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.5, delay: 1, ease: 'power2.out' },
      )
    }
  }, [mounted])

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    if (!mounted) return

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollingDown = currentScrollY > lastScrollY.current
      const scrollThreshold = 50 // Minimum scroll before hiding

      // Only toggle visibility if we've scrolled enough
      if (Math.abs(currentScrollY - lastScrollY.current) < 10) return

      if (scrollingDown && currentScrollY > scrollThreshold && isVisible.current) {
        // Hide
        isVisible.current = false
        gsap.to(buttonRef.current, {
          opacity: 0,
          y: -20,
          duration: 0.3,
          ease: 'power2.in',
        })
      } else if (!scrollingDown && !isVisible.current) {
        // Show
        isVisible.current = true
        gsap.to(buttonRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: 'power2.out',
        })
      }

      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
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
