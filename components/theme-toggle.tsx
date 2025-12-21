"use client"

import { useEffect, useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Laptop, Moon, Sun } from "lucide-react"

type ThemeMode = "system" | "light" | "dark"

const THEME_STORAGE_KEY = "theme"

function applyTheme(mode: ThemeMode, showTransition: boolean = true) {
  const root = document.documentElement

  // Resolve target theme (willDark) for any mode
  const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  const willDark = mode === "dark" ? true : mode === "light" ? false : prefersDark
  const wasDark = root.classList.contains("dark")

  // If no visual change, apply without animation and exit
  if (wasDark === willDark || !showTransition) {
    if (willDark) root.classList.add("dark")
    else root.classList.remove("dark")
    return
  }

  // Only show transition when switching between light/dark visually
  const overlay = document.getElementById("theme-transition-overlay")
  if (!overlay) {
    // Fallback: apply without animation if overlay missing
    if (willDark) root.classList.add("dark")
    else root.classList.remove("dark")
    return
  }

  // Fade in
  overlay.classList.remove("fade-out")
  overlay.classList.add("fade-in")

  // Wait for fade-in to complete
  setTimeout(() => {
    // Apply target theme
    if (willDark) root.classList.add("dark")
    else root.classList.remove("dark")

    // Fade out
    overlay.classList.remove("fade-in")
    overlay.classList.add("fade-out")

    // Clean up classes
    setTimeout(() => {
      overlay.classList.remove("fade-in", "fade-out")
    }, 250)
  }, 250)
}

export default function ThemeToggle({ variant = "header" }: { variant?: "header" | "floating" }) {
  const [mode, setMode] = useState<ThemeMode>("system")

  // track system preference for icon hint when in system mode
  const mediaQuery = useMemo(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined,
  [])
  const [systemDark, setSystemDark] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    // initial mode from storage - apply WITHOUT transition
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null) ?? "system"
    setMode(stored)
    applyTheme(stored, false)
  }, [])

  useEffect(() => {
    if (!mediaQuery) return
    const listener = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches)
      if (mode === "system") {
        applyTheme("system", true)
      }
    }
    // initial value
    setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener("change", listener)
    return () => mediaQuery.removeEventListener("change", listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaQuery, mode])

  const setTheme = (next: ThemeMode) => {
    setMode(next)
    localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next, true)
  }

  const CurrentIcon = mode === "system" ? (systemDark ? Moon : Sun) : mode === "dark" ? Moon : Sun

  const triggerClassesHeader = "p-2.5 rounded-xl bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 cursor-pointer"
  const triggerButton = (
    <button
      aria-label="Change theme"
      title="Theme"
      className={triggerClassesHeader}
    >
      <CurrentIcon className="w-5 h-5" />
    </button>
  )

  const floatingTrigger = (
    <button
      aria-label="Change theme"
      title="Theme"
      className="rounded-full bg-background/80 dark:bg-input/40 backdrop-blur-sm shadow-sm size-10 flex items-center justify-center border border-border cursor-pointer"
    >
      <CurrentIcon className="size-5" />
    </button>
  )

  const content = (
    <PopoverContent className="w-56 p-2" align="end">
      <div className="flex flex-col gap-1">
        <button
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer ${mode === "system" ? "bg-accent/60" : ""}`}
          onClick={() => setTheme("system")}
        >
          <Laptop className="size-4" />
          System
        </button>
        <button
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer ${mode === "light" ? "bg-accent/60" : ""}`}
          onClick={() => setTheme("light")}
        >
          <Sun className="size-4" />
          Light
        </button>
        <button
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer ${mode === "dark" ? "bg-accent/60" : ""}`}
          onClick={() => setTheme("dark")}
        >
          <Moon className="size-4" />
          Dark
        </button>
      </div>
    </PopoverContent>
  )

  if (variant === "floating") {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Popover>
          <PopoverTrigger asChild>{floatingTrigger}</PopoverTrigger>
          {content}
        </Popover>
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      {content}
    </Popover>
  )
}
