import {createContext, useContext, useEffect, useMemo, useState} from "react"

const AUTH_STORAGE_KEY = "medstream_token"

const AuthContext = createContext(null)

export function AuthProvider({children}) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY))

  useEffect(() => {
    if (token) {
      localStorage.setItem(AUTH_STORAGE_KEY, token)
      return
    }

    localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [token])

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login(nextToken) {
        setToken(nextToken)
      },
      logout() {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setToken(null)
      },
    }),
    [token],
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
