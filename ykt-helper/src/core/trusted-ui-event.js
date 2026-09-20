export function isTrustedUiEvent(event) {
  // Real browser-generated events have isTrusted=true; synthetic DOM events have false.
  // Tests and direct internal calls may omit the property entirely.
  return !event || event.isTrusted !== false;
}

export function trustedUiHandler(handler) {
  return function guardedTrustedUiHandler(event, ...args) {
    if (!isTrustedUiEvent(event)) return undefined;
    return handler.call(this, event, ...args);
  };
}
