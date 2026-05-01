import {formatCount} from "../utils/formatCount"

export default function CountValue({value, className = "", tooltipLabel = ""}) {
  const displayValue = formatCount(value)
  const defaultTooltip = displayValue !== String(value) ? String(value) : ""
  const resolvedTooltip = tooltipLabel || defaultTooltip
  const hasTooltip = Boolean(resolvedTooltip)

  return (
    <span className={`inline-flex ${className}`.trim()}>
      <span className="group relative inline-flex items-center">
        <span>{displayValue}</span>
        {hasTooltip && (
          <span
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {resolvedTooltip}
          </span>
        )}
      </span>
    </span>
  )
}
