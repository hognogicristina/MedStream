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

export default function AlertsStackedChart({data}) {
  return (
    <div className="w-full h-[320px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset="none">
          <CartesianGrid
            stroke="#1f2937"
            strokeDasharray="3 3"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            stroke="#6b7280"
            tick={{fontSize: 11}}
          />

          <YAxis
            stroke="#6b7280"
            tick={{fontSize: 11}}
            domain={[0, "auto"]}
            allowDecimals={false}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              color: "#fff",
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
