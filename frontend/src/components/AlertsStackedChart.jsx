import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {useTheme} from "./ThemeContext.jsx"
import {getChartTheme} from "../utils/theme.js"

export default function AlertsStackedChart({data}) {
  const {theme} = useTheme()
  const chartTheme = getChartTheme(theme)
  return (
    <div className="w-full h-[320px] rounded-2xl border p-4" style={{borderColor: chartTheme.cardBorder, backgroundColor: chartTheme.cardBg}}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset="none">
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
            domain={[0, "auto"]}
            allowDecimals={false}
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

          <Area
            type="monotone"
            dataKey="stable"
            name="Normalized"
            stackId="alerts"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.38}
            strokeWidth={2}
            isAnimationActive={true}
            animationDuration={420}
          />

          <Area
            type="monotone"
            dataKey="high"
            name="High"
            stackId="alerts"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.42}
            strokeWidth={2}
            isAnimationActive={true}
            animationDuration={420}
          />

          <Area
            type="monotone"
            dataKey="critical"
            name="Critical"
            stackId="alerts"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.46}
            strokeWidth={2}
            isAnimationActive={true}
            animationDuration={420}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
