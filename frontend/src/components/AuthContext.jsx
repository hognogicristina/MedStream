import {createContext, useContext, useEffect, useMemo, useState} from "react"
import {getCurrentDoctor} from "../services/doctorApi.js"

const AUTH_STORAGE_KEY = "medstream_token"

const AuthContext = createContext(null)

function parseJwtExpMs(token) {
  if (!token) {
    return null
  }
  const parts = String(token).split(".")
  if (parts.length < 2) {
    return null
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(window.atob(base64))
    const exp = Number(payload?.exp)
    if (!Number.isFinite(exp) || exp <= 0) {
      return null
    }
    return exp * 1000
  } catch {
    return null
  }
}

function isTokenExpired(token) {
  const expMs = parseJwtExpMs(token)
  if (!expMs) {
    return false
  }
  return Date.now() >= expMs
}

export function AuthProvider({children}) {
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!storedToken) {
      return null
    }
    if (isTokenExpired(storedToken)) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return storedToken
  })
  const [isAuthResolved, setIsAuthResolved] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      setIsAuthenticated(false)
      setIsAuthResolved(true)
      return
    }

    if (isTokenExpired(token)) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      setToken(null)
      setIsAuthenticated(false)
      setIsAuthResolved(true)
      return
    }

    localStorage.setItem(AUTH_STORAGE_KEY, token)
    setIsAuthResolved(false)
    let active = true

    const validateToken = async () => {
      try {
        await getCurrentDoctor({Authorization: `Bearer ${token}`})
        if (!active) {
          return
        }
        setIsAuthenticated(true)
        setIsAuthResolved(true)
      } catch {
        if (!active) {
          return
        }
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setToken(null)
        setIsAuthenticated(false)
        setIsAuthResolved(true)
      }
    }

    validateToken()

    return () => {
      active = false
    }
  }, [token])

  const value = useMemo(
    () => ({
      token,
      isAuthenticated,
      isAuthResolved,
      login(nextToken) {
        setToken(nextToken)
      },
      logout() {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setIsAuthenticated(false)
        setIsAuthResolved(true)
        setToken(null)
      },
      clearToken() {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setIsAuthenticated(false)
        setIsAuthResolved(true)
        setToken(null)
      },
    }),
    [isAuthenticated, isAuthResolved, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}
