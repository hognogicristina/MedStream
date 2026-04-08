import {useEffect, useState} from "react"
import BackButton from "../components/BackButton"
import CountValue from "../components/CountValue"
import DataTable from "../components/DataTable"
import {createWebSocket} from "../services/ws"
import {pushStoredEvent, readStoredEvents, subscribeToStoredEvents} from "../services/eventsFeed"

export default function EventsPage() {
  const [events, setEvents] = useState(() => readStoredEvents())
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)

  useEffect(() => {
    setEvents(readStoredEvents())
    setIsLoadingEvents(false)

    return subscribeToStoredEvents(setEvents)
  }, [])

  useEffect(() => {
    const socket = createWebSocket((msg) => {
      if (msg.type !== "event") {
        return
      }

      setEvents(pushStoredEvent(msg.data))
    })

    return () => socket.close()
  }, [])

  const uniqueEventTypes = [...new Set(events.map((event) => event.event_type).filter(Boolean))].sort()
  const uniquePatients = new Set(events.map((event) => event.patient_id).filter((patientId) => patientId !== null && patientId !== undefined)).size
  const latestEventTime = events[0]?.timestamp

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="console-topbar rounded-[24px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#9dccff]">Events Center</p>
              <BackButton/>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Hospital Events</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#b6bec9] sm:text-base">Operational event log with filters, sort order, and
                paging.</p>
            </div>
          </div>
        </header>

        <section className="monitor-card rounded-[28px] p-6">
          <div className="mb-6 grid gap-3 lg:grid-cols-4">
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Total Events</p>
              <p className="mt-2 text-2xl font-semibold text-white"><CountValue value={events.length}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Full live dataset currently in memory.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Event Types</p>
              <p className="mt-2 text-2xl font-semibold text-[#9dccff]"><CountValue value={uniqueEventTypes.length}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Distinct operational event categories.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Patients Impacted</p>
              <p className="mt-2 text-2xl font-semibold text-[#ffcf85]"><CountValue value={uniquePatients}/></p>
              <p className="mt-2 text-sm text-[#b6bec9]">Unique patients referenced by current events.</p>
            </div>
            <div className="monitor-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#879196]">Latest Event</p>
              <p
                className="mt-2 text-lg font-semibold text-white">{latestEventTime ? new Date(latestEventTime).toLocaleTimeString() : "--"}</p>
              <p
                className="mt-2 text-sm text-[#b6bec9]">{latestEventTime ? new Date(latestEventTime).toLocaleDateString() : "Waiting for live activity"}</p>
            </div>
          </div>

          <DataTable
            items={events}
            loading={isLoadingEvents}
            loadingMessage="Loading hospital events..."
            emptyMessage="No hospital events match the current filters."
            pageSize={10}
            defaultSort="newest"
            controlsLayoutClassName="mb-6 grid gap-4 rounded-[24px] border border-[#3b424b] bg-[#151b22] p-4 lg:grid-cols-[1fr_1fr_auto]"
            sortOptions={[
              {
                value: "newest",
                label: "Newest first",
                compare: (left, right) => new Date(right.timestamp) - new Date(left.timestamp),
              },
              {
                value: "oldest",
                label: "Oldest first",
                compare: (left, right) => new Date(left.timestamp) - new Date(right.timestamp),
              },
            ]}
            filters={[
              {
                id: "eventTypeFilter",
                label: "Event Type",
                type: "select",
                defaultValue: "all",
                options: [
                  {value: "all", label: "All event types"},
                  ...uniqueEventTypes.map((eventType) => ({
                    value: eventType,
                    label: eventType.replaceAll("_", " "),
                  })),
                ],
                matches: (event, value) => value === "all" || event.event_type === value,
              },
            ]}
            getItemKey={(event) => event.id}
            renderHeader={() => (
              <div
                className="grid grid-cols-[1fr_0.8fr_2.4fr_1.1fr] gap-3 border-b border-[#3b424b] bg-[#1b2430] px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#879196]">
                <div>Event Type</div>
                <div>Patient</div>
                <div>Message</div>
                <div>Created</div>
              </div>
            )}
            rowClassName={() => "grid grid-cols-[1fr_0.8fr_2.4fr_1.1fr] gap-3 bg-[#151b22] px-4 py-4"}
            renderRow={(event) => (
              <>
                <div>
                  <span
                    className="console-chip-success inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                    {(event.event_type || "hospital_event").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">{event.patient_id ?? "--"}</div>
                <div className="text-sm text-white">{event.message || "Hospital event"}</div>
                <div className="text-sm text-[#b6bec9]">{new Date(event.timestamp).toLocaleString()}</div>
              </>
            )}
          />
        </section>
      </div>
    </div>
  )
}
