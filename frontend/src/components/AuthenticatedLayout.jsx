import { Outlet } from "react-router-dom"
import Navbar from "./Navbar"

export default function AuthenticatedLayout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Outlet />
    </div>
  )
}
