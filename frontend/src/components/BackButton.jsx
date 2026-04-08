import { useNavigate } from "react-router-dom"

export default function BackButton({ fallbackTo = "/dashboard", label = "Back" }) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate(fallbackTo)
  }

  return (
    <button
      type="button"
      className="console-button-ghost inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
      onClick={handleClick}
    >
      <span className="mr-2 text-base leading-none" aria-hidden="true">‹</span>
      {label}
    </button>
  )
}
