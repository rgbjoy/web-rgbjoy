'use client'

import { useRef, useEffect, useSyncExternalStore, useState } from 'react'
import { Sun, Moon, Circle, Check } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import gsap from 'gsap'
import { useTheme } from '../contexts/ThemeContext'
import styles from './themeToggle.module.css'

// useSyncExternalStore is the React-recommended way to handle client-only rendering
const emptySubscribe = () => () => {}
const useIsMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true, // Client always returns true
    () => false, // Server always returns false
  )

type Theme = 'light' | 'dark' | 'red' | 'green' | 'blue'

const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { value: 'light', label: 'Light', icon: <Sun size={16} /> },
  { value: 'red', label: 'Red', icon: <Circle size={16} style={{ color: '#ff4444' }} /> },
  { value: 'green', label: 'Green', icon: <Circle size={16} style={{ color: '#44ff44' }} /> },
  { value: 'blue', label: 'Blue', icon: <Circle size={16} style={{ color: '#6666ff' }} /> },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsMounted()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const lastScrollY = useRef(0)
  const isVisible = useRef(true)
  const [open, setOpen] = useState(false)

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

  const getThemeIcon = () => {
    if (!mounted) return <div style={{ width: 20, height: 20 }} />
    const currentTheme = themes.find((t) => t.value === theme)
    return currentTheme?.icon || <Sun size={20} />
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={buttonRef}
          type="button"
          className={styles.themeToggle}
          style={{ opacity: 0 }}
          aria-label="Select theme"
          suppressHydrationWarning
        >
          {getThemeIcon()}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.popoverContent} sideOffset={5}>
          <div className={styles.themeList}>
            {themes.map((themeOption) => (
              <button
                key={themeOption.value}
                type="button"
                className={`${styles.themeOption} ${theme === themeOption.value ? styles.active : ''}`}
                onClick={() => {
                  setTheme(themeOption.value)
                  setOpen(false)
                }}
                aria-label={`Switch to ${themeOption.label} theme`}
              >
                <span className={styles.themeIcon}>{themeOption.icon}</span>
                <span className={styles.themeLabel}>{themeOption.label}</span>
                {theme === themeOption.value && (
                  <span className={styles.checkmark}>
                    <Check size={16} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
