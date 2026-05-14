import AwsLineChart from "./AwsLineChart.jsx"

export default function AlertsStackedChart({data}) {
  const chartData = Array.isArray(data) ? data : []

  return (
    <AwsLineChart
      ariaLabel="Alert severity trend"
      data={chartData}
      height={250}
      series={[
        {key: "stable", title: "Normalized", color: "#22c55e"},
        {key: "high", title: "High", color: "#f59e0b"},
        {key: "critical", title: "Critical", color: "#ef4444"},
      ]}
      xTitle="Time"
      yDomain={[0, Math.max(1, ...chartData.map((point) => Number(point.stable || 0) + Number(point.high || 0) + Number(point.critical || 0)))]}
      yTickFormatter={(value) => String(Math.round(value))}
    />
  )
}
