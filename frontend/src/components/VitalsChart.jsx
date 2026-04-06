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
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#8ea5c7" tick={{ fill: "#8ea5c7", fontSize: 12 }} />
          <YAxis stroke="#8ea5c7" tick={{ fill: "#8ea5c7", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#08101d",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              borderRadius: 16,
              color: "#d7e3f4",
            }}
            labelStyle={{ color: "#d7e3f4" }}
          />
          <Line type="monotone" dataKey="heart_rate" stroke="#fb7185" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="oxygen_saturation" stroke="#22c55e" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
