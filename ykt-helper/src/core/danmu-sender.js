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

/** Send one text through the native classroom barrage controls. */
export function sendDanmuText(text, { root = globalThis.document } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { sent: false, text, reason: 'empty' };
  }

  try {
    const input = root?.querySelector?.('.send__input');
    const button = root?.querySelector?.('.send__btn');
    if (!input || !button) {
      return { sent: false, text, reason: 'controls-unavailable' };
    }
    if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') {
      return { sent: false, text, reason: 'send-disabled' };
    }

    setInputValue(input, text);
    if (typeof button.click !== 'function') {
      return { sent: false, text, reason: 'send-unavailable' };
    }
    button.click();
    return { sent: true, text };
  } catch (error) {
    return {
      sent: false,
      text,
      reason: 'send-error',
      error,
    };
  }
}
