import {useEffect, useState} from "react"
import {api} from "../services/api"
import {createWebSocket} from "../services/ws"

export default function Dashboard() {
    const [patients, setPatients] = useState([])
    const [doctors, setDoctors] = useState([])
    const [vitals, setVitals] = useState([])
    const [alerts, setAlerts] = useState([])

    useEffect(() => {
        const load = async () => {
            const [patientsRes, doctorsRes] = await Promise.all([
                api.get("/patients"),
                api.get("/doctors"),
            ])

            setPatients(patientsRes.data)
            setDoctors(doctorsRes.data)
        }

        load()

        const socket = createWebSocket((msg) => {
            if (msg.type === "vital") {
                setVitals((prev) => [msg.data, ...prev.slice(0, 10)])
            }

            if (msg.type === "alert") {
                setAlerts((prev) => [msg.data, ...prev.slice(0, 10)])
            }
        })

        return () => socket.close()
    }, [])

    return (
        <div style={{padding: 24}}>
            <h1>MedStream Live Dashboard</h1>

            <h2>Live Vitals</h2>
            <ul>
                {vitals.map((v, i) => (
                    <li key={i}>
                        Patient {v.patient_id} | HR: {v.heart_rate} | O2: {v.oxygen_saturation} | Temp: {v.temperature}
                    </li>
                ))}
            </ul>

            <h2>Alerts</h2>
            <ul>
                {alerts.map((a, i) => (
                    <li key={i} style={{color: "red"}}>
                        Patient {a.patient_id} - {a.message}
                    </li>
                ))}
            </ul>
        </div>
    )
}