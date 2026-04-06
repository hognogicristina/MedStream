import {useEffect, useState} from "react"
import {api} from "../services/api"
import {createWebSocket} from "../services/ws"
import VitalsChart from "../components/VitalsChart"

export default function Dashboard() {
    const [vitals, setVitals] = useState([])
    const [alerts, setAlerts] = useState([])
    const [stats, setStats] = useState([])

    useEffect(() => {
        const load = async () => {
            const statsRes = await api.get("/stats")
            setStats(statsRes.data)
        }

        load()

        const socket = createWebSocket((msg) => {
            if (msg.type === "vital") {
                setVitals((prev) => [
                    {
                        ...msg.data,
                        time: new Date().toLocaleTimeString(),
                    },
                    ...prev.slice(0, 20),
                ])
            }

            if (msg.type === "alert") {
                setAlerts((prev) => [msg.data, ...prev.slice(0, 10)])
            }
        })

        return () => socket.close()
    }, [])

    return (
        <div style={{padding: 24}}>
            <h1>MedStream Dashboard</h1>

            <h2>Live Streaming (Real-Time)</h2>
            <VitalsChart data={[...vitals].reverse()}/>

            <h3>Alerts</h3>
            <ul>
                {alerts.map((a, i) => (
                    <li
                        key={i}
                        style={{
                            color: a.severity === "critical" ? "darkred" : "red",
                            fontWeight: "bold",
                        }}
                    >
                        Patient {a.patient_id} - {a.message}
                    </li>
                ))}
            </ul>

            <hr/>

            <h2>Batch Analytics</h2>
            <ul>
                {stats.map((s, i) => (
                    <li key={i}>
                        Patient {s.patient_id} | Avg HR: {s.avg_heart_rate.toFixed(1)} | Avg Temp: {s.avg_temperature.toFixed(1)} |
                        Alerts: {s.alerts_count}
                    </li>
                ))}
            </ul>

            <hr/>

            <h2>Streaming vs Batch Comparison</h2>
            <div>
                <p><b>Streaming:</b> instant alerts, live monitoring</p>
                <p><b>Batch:</b> historical averages, trends, analysis</p>
            </div>
        </div>
    )
}