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

export default function VitalsChart({data}) {
  return (
    <div className="w-full h-[320px] rounded-2xl border border-[#2a3441] bg-[#0f141a] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
            domain={["auto", "auto"]}
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
