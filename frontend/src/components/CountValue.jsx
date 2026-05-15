import {formatCount} from "../utils/formatCount"
import HoverTextDropdown from "./HoverTextDropdown.jsx"

export default function CountValue({value, className = "", tooltipLabel = ""}) {
  const displayValue = formatCount(value)
  const defaultTooltip = displayValue !== String(value) ? String(value) : ""
  const resolvedTooltip = tooltipLabel || defaultTooltip

  return (
    <HoverTextDropdown className={className} content={resolvedTooltip}>
      <span>{displayValue}</span>
    </HoverTextDropdown>
  )
}
