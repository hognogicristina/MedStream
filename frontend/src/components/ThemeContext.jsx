import {createContext, useContext, useEffect, useMemo, useState} from "react"

const THEME_STORAGE_KEY = "medstream-theme"
const DEFAULT_THEME = "dark"

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleTheme: () => {},
})

function normalizeTheme(value) {
  return value === "light" ? "light" : "dark"
}

export function ThemeProvider({children}) {
  const [theme, setThemeState] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return normalizeTheme(stored)
  })

  useEffect(() => {
    const normalizedTheme = normalizeTheme(theme)
    document.documentElement.setAttribute("data-theme", normalizedTheme)
    document.documentElement.classList.toggle("theme-light", normalizedTheme === "light")
    document.documentElement.classList.toggle("theme-dark", normalizedTheme === "dark")
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)

    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute("content", normalizedTheme === "light" ? "#f3f5f8" : "#0d1b26")
    }
  }, [theme])

  const setTheme = (nextTheme) => {
    setThemeState(normalizeTheme(nextTheme))
  }

  const toggleTheme = () => {
    setThemeState((currentTheme) => currentTheme === "dark" ? "light" : "dark")
  }

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
  }), [theme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
