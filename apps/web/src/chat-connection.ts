// Defer construction so Strict Mode's immediate setup/cleanup cycle can cancel
// before starting a handshake. Never abort an in-progress handshake on cleanup.
export function scheduleChatConnection(
  url: string,
  onConnect: (connection: WebSocket) => void,
): () => void {
  let connection: WebSocket | undefined;
  const timer = setTimeout(() => {
    connection = new WebSocket(url);
    onConnect(connection);
  }, 0);

  return () => {
    clearTimeout(timer);
    if (!connection) return;
    connection.onopen = null;
    connection.onmessage = null;
    connection.onerror = null;
    connection.onclose = null;
    if (connection.readyState === WebSocket.CONNECTING) {
      const pending = connection;
      pending.addEventListener('open', () => pending.close(), { once: true });
    } else if (connection.readyState === WebSocket.OPEN) {
      connection.close();
    }
  };
}
