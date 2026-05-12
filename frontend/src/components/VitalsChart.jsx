import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from "recharts"
import {useTheme} from "./ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

export default function VitalsChart({data}) {
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  return (
    <div className="w-full h-[320px] rounded-2xl border p-4" style={{borderColor: chartTheme.cardBorder, backgroundColor: chartTheme.cardBg}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid
            stroke={chartTheme.grid}
            strokeDasharray="3 3"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            stroke={chartTheme.axis}
            tick={{fontSize: 11}}
          />

          <YAxis
            stroke={chartTheme.axis}
            tick={{fontSize: 11}}
            domain={["auto", "auto"]}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: chartTheme.tooltipBg,
              border: `1px solid ${chartTheme.tooltipBorder}`,
              borderRadius: "12px",
              color: chartTheme.tooltipText,
            }}
          />
          <Legend wrapperStyle={{fontSize: "12px"}}/>

          <Line
            type="monotone"
            dataKey="heart_rate"
            name="Heart Rate"
            stroke="#f97316"
            strokeWidth={3}
            dot={false}
            activeDot={{r: 5}}
            isAnimationActive={true}
            animationDuration={300}
          />

          <Line
            type="monotone"
            dataKey="oxygen_saturation"
            name="Oxygen Saturation"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={false}
            isAnimationActive={true}
            animationDuration={300}
          />

          <Line
            type="monotone"
            dataKey="temperature"
            name="Temperature"
            stroke="#22c55e"
            strokeWidth={3}
            dot={false}
            isAnimationActive={true}
            animationDuration={300}
          />

        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
