export function createWebSocket(onMessage) {
  const socket = new WebSocket("ws://localhost:8000/ws")

  socket.onopen = () => {
    console.log("WebSocket connected")
  }

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data)
    onMessage(data)
  }

  socket.onclose = () => {
    console.log("WebSocket disconnected")
  }

  return socket
}