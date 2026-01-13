'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'red' | 'green' | 'blue'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as Theme) || 'dark'
    }
    return 'dark'
  })

  const applyTheme = (newTheme: Theme) => {
    if (typeof window === 'undefined') return
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  useEffect(() => {
    // Apply theme on mount and when theme changes
    applyTheme(theme)
  }, [theme])

  const setThemeValue = (newTheme: Theme) => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  }

  const toggleTheme = () => {
    // Cycle through themes: dark -> light -> red -> green -> blue -> dark
    const themeOrder: Theme[] = ['dark', 'light', 'red', 'green', 'blue']
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % themeOrder.length
    setThemeValue(themeOrder[nextIndex]!)
  }

  // Always provide the context, even before mount
  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeValue, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
