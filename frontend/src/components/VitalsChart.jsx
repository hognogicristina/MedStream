import AwsLineChart from "./AwsLineChart.jsx"

export default function VitalsChart({data, height = 250, hideLegend = false}) {
  return (
    <AwsLineChart
      ariaLabel="Vital signs trend"
      data={data}
      height={height}
      hideLegend={hideLegend}
      series={[
        {key: "heart_rate", title: "Heart Rate", color: "#f97316", valueFormatter: (value) => `${value.toFixed(0)} bpm`},
        {key: "oxygen_saturation", title: "Oxygen Saturation", color: "#3b82f6", valueFormatter: (value) => `${value.toFixed(0)}%`},
        {key: "temperature", title: "Temperature", color: "#22c55e", valueFormatter: (value) => `${value.toFixed(1)}°C`},
      ]}
      xTitle="Time"
    />
  )
}
