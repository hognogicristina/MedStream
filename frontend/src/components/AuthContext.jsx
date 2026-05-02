import {createContext, useContext, useEffect, useMemo, useState} from "react"
import {getCurrentDoctor} from "../services/doctorApi.js"

const AUTH_STORAGE_KEY = "medstream_token"

const AuthContext = createContext(null)

export function AuthProvider({children}) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY))
  const [isAuthResolved, setIsAuthResolved] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
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
