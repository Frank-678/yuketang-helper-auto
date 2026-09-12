const DEFAULT_CONFIRMATION_MS = 1500;
const pendingSends = [];

function dispatchInputEvent(input, type) {
  if (typeof input?.dispatchEvent !== 'function') return;
  const EventCtor = input.ownerDocument?.defaultView?.Event || globalThis.Event;
  try {
    input.dispatchEvent(typeof EventCtor === 'function'
      ? new EventCtor(type, { bubbles: true })
      : { type, bubbles: true });
  } catch {
    try { input.dispatchEvent({ type, bubbles: true }); } catch {}
  }
}

function setInputValue(input, text) {
  const valueDescriptor = (() => {
    let current = input;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'value');
      if (descriptor) return descriptor;
      current = Object.getPrototypeOf(current);
    }
    return null;
  })();

  if (typeof valueDescriptor?.set === 'function') {
    valueDescriptor.set.call(input, text);
  } else if ('value' in input) {
    input.value = text;
  } else {
    input.textContent = text;
  }

  dispatchInputEvent(input, 'input');
  dispatchInputEvent(input, 'change');
}

function normalizeOperation(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getOperation(message) {
  return normalizeOperation(message?.op || message?.type || message?.action);
}

function findDanmuText(source, visited = new Set()) {
  if (!source || typeof source !== 'object' || visited.has(source)) return null;
  visited.add(source);

  for (const key of ['danmu', 'barrage', 'text']) {
    if (typeof source[key] === 'string' && source[key].trim()) return source[key];
  }

  for (const key of ['data', 'payload', 'message', 'msg', 'content']) {
    const nested = source[key];
    if (nested && typeof nested === 'object') {
      const text = findDanmuText(nested, visited);
      if (text) return text;
    }
  }
  return null;
}

function isDanmuSendMessage(message) {
  const operation = getOperation(message);
  if (!(operation.includes('danmu')
    || operation.includes('barrage')
    || operation === 'sendmessage'
    || operation === 'sendchat')) return false;
  return !!findDanmuText(message);
}

/**
 * Resolve the oldest pending DOM send when the WebSocket interceptor sees a
 * matching outbound barrage frame.  Returns the number of resolved sends.
 */
export function confirmDanmuSend(message) {
  if (!isDanmuSendMessage(message)) return 0;
  const outboundText = findDanmuText(message);
  const index = pendingSends.findIndex(item => (
    item.text === outboundText || item.text.trim() === String(outboundText).trim()
  ));
  if (index === -1) return 0;

  const [pending] = pendingSends.splice(index, 1);
  clearTimeout(pending.timer);
  pending.resolve({
    sent: true,
    verified: true,
    text: pending.text,
  });
  return 1;
}

function waitForConfirmation(text, timeoutMs) {
  let pending;
  const promise = new Promise(resolve => {
    pending = {
      text,
      resolve,
      timer: setTimeout(() => {
        const index = pendingSends.indexOf(pending);
        if (index !== -1) pendingSends.splice(index, 1);
        resolve({
          sent: false,
          verified: false,
          text,
          reason: 'send-unconfirmed',
        });
      }, timeoutMs),
    };
    pendingSends.push(pending);
  });
  return { promise, pending };
}

/** Send one text through the native classroom barrage controls. */
export async function sendDanmuText(text, {
  root = globalThis.document,
  awaitConfirmationMs = DEFAULT_CONFIRMATION_MS,
} = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { sent: false, verified: false, text, reason: 'empty' };
  }

  try {
    const input = root?.querySelector?.('.send__input');
    const button = root?.querySelector?.('.send__btn');
    if (!input || !button) {
      return { sent: false, verified: false, text, reason: 'controls-unavailable' };
    }
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return { sent: false, verified: false, text, reason: 'send-disabled' };
    }
    if (typeof button.click !== 'function') {
      return { sent: false, verified: false, text, reason: 'send-unavailable' };
    }

    const timeout = Math.max(0, Number.isFinite(Number(awaitConfirmationMs))
      ? Number(awaitConfirmationMs)
      : DEFAULT_CONFIRMATION_MS);
    const confirmation = waitForConfirmation(text, timeout);
    try {
      setInputValue(input, text);
      button.click();
    } catch (error) {
      const index = pendingSends.indexOf(confirmation.pending);
      if (index !== -1) pendingSends.splice(index, 1);
      clearTimeout(confirmation.pending.timer);
      return { sent: false, verified: false, text, reason: 'send-error', error };
    }
    return await confirmation.promise;
  } catch (error) {
    return {
      sent: false,
      verified: false,
      text,
      reason: 'send-error',
      error,
    };
  }
}
