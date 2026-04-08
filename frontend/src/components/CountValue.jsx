import {formatCount} from "../utils/formatCount"

export default function CountValue({value, className = ""}) {
  const displayValue = formatCount(value)
  const hasTooltip = displayValue !== String(value)

  return (
    <span className={`inline-flex ${className}`.trim()}>
      <span className="group relative inline-flex items-center">
        <span>{displayValue}</span>
        {hasTooltip && (
          <span
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#454c55] bg-[#0f141a] px-2 py-1 text-xs font-medium text-[#d5dbdb] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {value}
          </span>
        )}
      </span>
    </span>
  )
}
