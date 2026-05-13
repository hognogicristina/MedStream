import {createContext, useContext, useEffect, useMemo, useState} from "react"
import {getCurrentDoctor} from "../services/doctorApi.js"
import {getResponseData} from "../services/apiMessages.js"

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
  const [isAuthResolved, setIsAuthResolved] = useState(() => !token)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentDoctor, setCurrentDoctor] = useState(null)

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return
    }

    localStorage.setItem(AUTH_STORAGE_KEY, token)
    let active = true

    const validateToken = async () => {
      try {
        const response = await getCurrentDoctor({Authorization: `Bearer ${token}`})
        if (!active) {
          return
        }
        setCurrentDoctor(getResponseData(response))
        setIsAuthenticated(true)
        setIsAuthResolved(true)
      } catch {
        if (!active) {
          return
        }
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setToken(null)
        setCurrentDoctor(null)
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
      currentDoctor,
      isAuthenticated,
      isAuthResolved,
      login(nextToken) {
        if (isTokenExpired(nextToken)) {
          localStorage.removeItem(AUTH_STORAGE_KEY)
          setCurrentDoctor(null)
          setIsAuthenticated(false)
          setIsAuthResolved(true)
          setToken(null)
          return
        }
        setCurrentDoctor(null)
        setIsAuthenticated(false)
        setIsAuthResolved(false)
        setToken(nextToken)
      },
      logout() {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setCurrentDoctor(null)
        setIsAuthenticated(false)
        setIsAuthResolved(true)
        setToken(null)
      },
      clearToken() {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setCurrentDoctor(null)
        setIsAuthenticated(false)
        setIsAuthResolved(true)
        setToken(null)
      },
    }),
    [currentDoctor, isAuthenticated, isAuthResolved, token],
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
