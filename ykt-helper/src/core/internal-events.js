const listeners = new Map();

export function onInternalEvent(type, handler) {
  if (typeof handler !== 'function') return () => {};
  const key = String(type || '');
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(handler);
  return () => listeners.get(key)?.delete(handler);
}

export function emitInternalEvent(type, detail = undefined) {
  const key = String(type || '');
  const event = { type: key, detail };
  for (const handler of [...(listeners.get(key) || [])]) {
    try { handler(event); } catch (error) {
      console.warn('[雨课堂助手][WARN][internal-events] listener failed', key, error);
    }
  }
}

export function clearInternalEventListenersForTest() {
  listeners.clear();
}
