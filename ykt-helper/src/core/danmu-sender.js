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

function outboundText(message) {
  if (!message || typeof message !== 'object') return null;
  for (const k of ['danmu', 'text', 'barrage']) if (typeof message[k] === 'string') return message[k];
  for (const k of ['data', 'payload', 'message', 'msg']) { const value = outboundText(message[k]); if (value) return value; }
  return null;
}
/** A matching outbound frame proves dispatch, not server acceptance. */
export async function sendDanmuText(text, { root = globalThis.document, lessonId = null, awaitConfirmationMs = 2000 } = {}) {
  if (!String(text || '').trim()) return { sent: false, reason: 'empty' };
  const input = root?.querySelector?.('.send__input'), button = root?.querySelector?.('.send__btn');
  if (!input || !button) return { sent: false, reason: 'controls-unavailable' };
  if (String(input.value ?? input.textContent ?? '').trim() || root.activeElement === input) return { sent: false, reason: 'user-editing' };
  if (button.disabled || typeof button.click !== 'function') return { sent: false, reason: 'send-disabled' };
  return new Promise(resolve => {
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); window.removeEventListener('ykt:danmu-outbound', onOutbound); resolve({ text, ...result }); };
    const onOutbound = event => {
      const detail = event.detail || {}, op = String(detail.message?.op || detail.message?.type || '').toLowerCase();
      if (lessonId != null && String(detail.lessonId) !== String(lessonId)) return;
      if (!/danmu|barrage|sendmessage|sendchat/.test(op)) return;
      if (outboundText(detail.message) === text) finish({ sent: true, dispatched: true, confirmed: false });
    };
    const timer = setTimeout(() => { if (input.value === text) setInputValue(input, ''); finish({ sent: false, unknown: true, reason: 'no-outbound-observed' }); }, awaitConfirmationMs);
    window.addEventListener('ykt:danmu-outbound', onOutbound);
    try { setInputValue(input, text); button.click(); } catch (error) { if (input.value === text) setInputValue(input, ''); finish({ sent: false, reason: 'send-error', error }); }
  });
}
