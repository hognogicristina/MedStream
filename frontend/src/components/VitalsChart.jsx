import { useEffect, useRef, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export default function VitalsChart({ data }) {
  const containerRef = useRef(null)
  const [hasSize, setHasSize] = useState(false)

  useEffect(() => {
    const node = containerRef.current

    if (!node) {
      return undefined
    }

    const updateSize = () => {
      setHasSize(node.clientWidth > 0 && node.clientHeight > 0)
    }

    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className="min-h-[300px] w-full">
      {hasSize && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(91, 100, 110, 0.4)" strokeDasharray="3 3" />
            <XAxis dataKey="time" stroke="#b6bec9" tick={{ fill: "#b6bec9", fontSize: 12 }} />
            <YAxis stroke="#b6bec9" tick={{ fill: "#b6bec9", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1b2430",
                border: "1px solid #4d5661",
                borderRadius: 12,
                color: "#f2f3f3",
              }}
              labelStyle={{ color: "#f2f3f3" }}
            />
            <Line type="monotone" dataKey="heart_rate" stroke="#ff9900" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="oxygen_saturation" stroke="#1f77b4" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
