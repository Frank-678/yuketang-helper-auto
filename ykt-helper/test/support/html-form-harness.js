import { createFakeElement } from './browser-harness.js';

function readAttr(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
}

/**
 * Materialize all id-bearing controls/elements from a real HTML template into
 * the lightweight fake DOM. Hierarchy is intentionally flat: panel tests care
 * about product event handlers and form values, not browser layout parsing.
 */
export function materializeIdElements(html, { rootId } = {}) {
  const source = String(html || '');
  const entries = [];
  const re = /<([a-zA-Z][\w:-]*)([^>]*\bid\s*=\s*["']([^"']+)["'][^>]*)>/g;
  let match;
  while ((match = re.exec(source))) {
    entries.push({ tag: match[1], attrs: match[2], id: match[3] });
  }

  const chosenRootId = rootId || entries[0]?.id || 'fixture-root';
  const rootEntry = entries.find(entry => entry.id === chosenRootId);
  const root = createFakeElement(rootEntry?.tag || 'div');
  root.id = chosenRootId;

  for (const entry of entries) {
    if (entry.id === chosenRootId) continue;
    const el = createFakeElement(entry.tag);
    el.id = entry.id;
    const type = readAttr(entry.attrs, 'type');
    const value = readAttr(entry.attrs, 'value');
    if (type) el.type = type;
    if (value) el.value = value;
    if (/\bchecked(?:\s|>|=)/i.test(entry.attrs)) el.checked = true;
    if (/\bdisabled(?:\s|>|=)/i.test(entry.attrs)) el.disabled = true;
    root.appendChild(el);
  }

  return root;
}

export function installTemplateMaterializer(document, html, { rootId } = {}) {
  const originalCreateElement = document.createElement;
  document.createElement = tagName => {
    const element = originalCreateElement(tagName);
    const descriptor = Object.getOwnPropertyDescriptor(element, 'innerHTML');
    if (!descriptor?.set) return element;
    Object.defineProperty(element, 'innerHTML', {
      get: descriptor.get,
      set(value) {
        descriptor.set.call(element, value);
        if (String(value) !== String(html)) return;
        element.appendChild(materializeIdElements(html, { rootId }));
      },
      configurable: true,
      enumerable: true,
    });
    return element;
  };
  return () => { document.createElement = originalCreateElement; };
}
