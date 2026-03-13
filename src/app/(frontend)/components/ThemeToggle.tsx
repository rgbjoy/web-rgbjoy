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

const SCROLL_THRESHOLD = 100 // show theme toggle only when scroll is this many px or less from top

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsMounted()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const lastScrollY = useRef(0)
  const isVisible = useRef(true)
  const [open, setOpen] = useState(false)

  // Initial fade in (only when near top)
  useEffect(() => {
    if (mounted && buttonRef.current && window.scrollY <= SCROLL_THRESHOLD) {
      isVisible.current = true
      gsap.fromTo(
        buttonRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.5, delay: 1, ease: 'power2.out' },
      )
    }
  }, [mounted])

  // Only show when scroll is 100px or less from top
  useEffect(() => {
    if (!mounted) return

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const shouldShow = currentScrollY <= SCROLL_THRESHOLD

      if (shouldShow && !isVisible.current) {
        isVisible.current = true
        gsap.to(buttonRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: 'power2.out',
        })
      } else if (!shouldShow && isVisible.current) {
        isVisible.current = false
        gsap.to(buttonRef.current, {
          opacity: 0,
          y: -20,
          duration: 0.3,
          ease: 'power2.in',
        })
      }

      lastScrollY.current = currentScrollY
    }

    handleScroll() // set initial visibility from current scroll
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
