"use client"

import { Moon, Sun, SunMoon } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AppHeader() {
  const { theme, mode, setMode } = useTheme()

  // Cycle through modes: auto → light → dark → auto
  const cycleMode = () => {
    if (mode === 'auto') {
      setMode('light')
    } else if (mode === 'light') {
      setMode('dark')
    } else {
      setMode('auto')
    }
  }

  const getModeLabel = () => {
    switch (mode) {
      case 'auto':
        return 'Auto (based on time)'
      case 'light':
        return 'Light'
      case 'dark':
        return 'Dark'
    }
  }

  return (
    <header className="flex h-16 items-center justify-end border-b border-border bg-background px-6">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleMode}
              className="rounded-full"
            >
              {mode === 'auto' ? (
                <SunMoon className="h-5 w-5" />
              ) : theme === 'dark' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getModeLabel()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </header>
  )
}
