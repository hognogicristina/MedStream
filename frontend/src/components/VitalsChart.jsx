import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

export default function VitalsChart({ data }) {
  return (
    <LineChart width={600} height={250} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="heart_rate" stroke="#ff0000" />
      <Line type="monotone" dataKey="oxygen_saturation" stroke="#00aa00" />
    </LineChart>
  )
}