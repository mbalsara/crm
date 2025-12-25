"use client"

import * as React from 'react'

type Theme = 'light' | 'dark'
type ThemeMode = 'auto' | 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

interface ThemeProviderProps {
  children: React.ReactNode
  /** Hour (0-23) when day starts. Default: 6 (6 AM) */
  dayStartHour?: number
  /** Hour (0-23) when night starts. Default: 18 (6 PM) */
  nightStartHour?: number
}

const ThemeContext = React.createContext<ThemeContextType>({
  theme: 'light',
  mode: 'auto',
  setMode: () => {},
})

export function useTheme() {
  return React.useContext(ThemeContext)
}

/**
 * Get the appropriate theme based on current time
 * Light theme during day hours, dark theme at night
 */
function getThemeForTime(dayStartHour: number, nightStartHour: number): Theme {
  const hour = new Date().getHours()

  // Day time: between dayStartHour and nightStartHour
  if (hour >= dayStartHour && hour < nightStartHour) {
    return 'light'
  }

  // Night time
  return 'dark'
}

/**
 * Calculate milliseconds until the next theme change
 */
function getMsUntilNextChange(dayStartHour: number, nightStartHour: number): number {
  const now = new Date()
  const currentHour = now.getHours()

  let nextChangeHour: number

  if (currentHour >= dayStartHour && currentHour < nightStartHour) {
    // Currently day, next change is at nightStartHour
    nextChangeHour = nightStartHour
  } else {
    // Currently night, next change is at dayStartHour
    nextChangeHour = dayStartHour
  }

  // Calculate the next change time
  const nextChange = new Date(now)
  nextChange.setHours(nextChangeHour, 0, 0, 0)

  // If the next change time is in the past (same day), move to next day
  if (nextChange <= now) {
    nextChange.setDate(nextChange.getDate() + 1)
  }

  return nextChange.getTime() - now.getTime()
}

/**
 * Auto-theme provider that switches between light and dark themes based on time of day
 * Similar to Apple's auto theme feature
 *
 * Supports three modes:
 * - 'auto': Automatically switch based on time (light during day, dark at night)
 * - 'light': Always use light theme
 * - 'dark': Always use dark theme
 */
export function ThemeProvider({
  children,
  dayStartHour = 6,    // 6 AM
  nightStartHour = 18  // 6 PM
}: ThemeProviderProps) {
  const [mode, setMode] = React.useState<ThemeMode>('auto')
  const [autoTheme, setAutoTheme] = React.useState<Theme>(() =>
    getThemeForTime(dayStartHour, nightStartHour)
  )

  // The actual theme to apply
  const theme: Theme = mode === 'auto' ? autoTheme : mode

  // Update auto theme based on time
  React.useEffect(() => {
    if (mode !== 'auto') return

    // Set initial theme
    setAutoTheme(getThemeForTime(dayStartHour, nightStartHour))

    // Schedule update for next theme change
    let timeoutId: NodeJS.Timeout

    const scheduleNextUpdate = () => {
      const msUntilChange = getMsUntilNextChange(dayStartHour, nightStartHour)

      // Add a small buffer (1 second) to ensure we're past the transition
      timeoutId = setTimeout(() => {
        setAutoTheme(getThemeForTime(dayStartHour, nightStartHour))
        // Schedule the next update
        scheduleNextUpdate()
      }, msUntilChange + 1000)
    }

    scheduleNextUpdate()

    return () => clearTimeout(timeoutId)
  }, [dayStartHour, nightStartHour, mode])

  // Apply theme class to document
  React.useEffect(() => {
    const root = document.documentElement

    // Remove both classes first
    root.classList.remove('light', 'dark')

    // Add the current theme class
    root.classList.add(theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
