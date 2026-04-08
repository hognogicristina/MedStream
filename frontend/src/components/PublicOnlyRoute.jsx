import {Navigate} from "react-router-dom"
import {useAuth} from "../auth/AuthContext"

export default function PublicOnlyRoute({children}) {
  const {isAuthenticated} = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace/>
  }

  return children
}
