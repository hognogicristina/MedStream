const STORAGE_KEY = "medstream-hospital-events"
const UPDATE_EVENT = "medstream-hospital-events-updated"
const MAX_EVENTS = 100

function normalizeTimestamp(timestamp) {
  if (!timestamp) {
    return new Date().toISOString()
  }

  const parsed = new Date(timestamp)

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }

  return parsed.toISOString()
}

function createEventId(event) {
  return [
    event.patient_id ?? "na",
    event.event_type ?? "generic",
    event.message ?? "",
    event.timestamp,
  ].join("|")
}

function normalizeEvent(event) {
  const timestamp = normalizeTimestamp(event.timestamp || event.time)

  return {
    ...event,
    timestamp,
    time: new Date(timestamp).toLocaleTimeString(),
    id: event.id || createEventId({...event, timestamp}),
  }
}

function sortEvents(events) {
  return [...events].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
}

function areEventsEqual(left, right) {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  return left.every((event, index) => {
    const other = right[index]

    return (
      event.id === other.id &&
      event.timestamp === other.timestamp &&
      event.event_type === other.event_type &&
      event.message === other.message &&
      event.patient_id === other.patient_id
    )
  })
}

function persistEvents(events) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, {detail: events}))
}

export function readStoredEvents() {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return sortEvents(parsed.map(normalizeEvent)).slice(0, MAX_EVENTS)
  } catch {
    return []
  }
}

export function pushStoredEvent(event) {
  const nextEvent = normalizeEvent(event)
  const nextEvents = sortEvents([nextEvent, ...readStoredEvents().filter((entry) => entry.id !== nextEvent.id)]).slice(0, MAX_EVENTS)
  persistEvents(nextEvents)
  return nextEvents
}

export function subscribeToStoredEvents(listener) {
  if (typeof window === "undefined") {
    return () => {
    }
  }

  let lastEvents = readStoredEvents()

  const emitIfChanged = (nextEvents) => {
    if (areEventsEqual(lastEvents, nextEvents)) {
      return
    }

    lastEvents = nextEvents
    listener(nextEvents)
  }

  const handleUpdate = (event) => {
    emitIfChanged(Array.isArray(event.detail) ? event.detail : readStoredEvents())
  }

  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      emitIfChanged(readStoredEvents())
    }
  }

  window.addEventListener(UPDATE_EVENT, handleUpdate)
  window.addEventListener("storage", handleStorage)

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate)
    window.removeEventListener("storage", handleStorage)
  }
}
