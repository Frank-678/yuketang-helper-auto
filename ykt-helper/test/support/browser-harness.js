export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [String(k), String(v)]));
  return {
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; },
    dump() { return Object.fromEntries(data); },
  };
}

function makeClassList() {
  const values = new Set();
  return {
    add(...names) { names.filter(Boolean).forEach(name => values.add(String(name))); },
    remove(...names) { names.forEach(name => values.delete(String(name))); },
    contains(name) { return values.has(String(name)); },
    toggle(name, force) {
      const key = String(name);
      if (force === true) { values.add(key); return true; }
      if (force === false) { values.delete(key); return false; }
      if (values.has(key)) { values.delete(key); return false; }
      values.add(key); return true;
    },
    setFromString(value) {
      values.clear();
      String(value || '').split(/\s+/).filter(Boolean).forEach(name => values.add(name));
    },
    toString() { return [...values].join(' '); },
  };
}

function matchesSelector(element, selector) {
  const normalized = String(selector || '').trim();
  if (!normalized) return false;
  if (normalized.startsWith('.')) return element.classList?.contains(normalized.slice(1)) === true;
  if (normalized.startsWith('#')) return String(element.id || '') === normalized.slice(1);
  return String(element.tagName || '').toLowerCase() === normalized.toLowerCase();
}

export function createFakeElement(tagName = 'div') {
  const listeners = new Map();
  const children = [];
  const attributes = new Map();
  const classList = makeClassList();
  let innerHTML = '';
  let className = '';

  const element = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    style: {},
    dataset: {},
    classList,
    children,
    parentNode: null,
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    onclick: null,
    appendChild(child) { children.push(child); child.parentNode = this; return child; },
    remove() { if (!this.parentNode?.children) return; const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); },
    setAttribute(name, value) {
      const key = String(name);
      const str = String(value);
      attributes.set(key, str);
      if (key === 'id') this.id = str;
      if (key === 'class') this.className = str;
    },
    getAttribute(name) {
      const key = String(name);
      if (key === 'id' && this.id) return this.id;
      if (key === 'class' && this.className) return this.className;
      return attributes.get(key) ?? null;
    },
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    removeEventListener(type, fn) { const list = listeners.get(type) || []; listeners.set(type, list.filter(item => item !== fn)); },
    dispatchEvent(event) { for (const fn of listeners.get(event?.type) || []) fn.call(this, event); return true; },
    querySelector(selector) {
      for (const child of children) {
        if (matchesSelector(child, selector)) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(selector) {
      const found = [];
      for (const child of children) {
        if (matchesSelector(child, selector)) found.push(child);
        found.push(...(child.querySelectorAll?.(selector) || []));
      }
      return found;
    },
    closest(selector) {
      let node = this;
      while (node) {
        if (matchesSelector(node, selector)) return node;
        node = node.parentNode;
      }
      return null;
    },
    focus() {},
    click() {
      if (this.disabled) return undefined;
      const event = { type: 'click', target: this, currentTarget: this, preventDefault() {} };
      const result = typeof this.onclick === 'function' ? this.onclick(event) : undefined;
      this.dispatchEvent(event);
      return result;
    },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }; },
  };

  Object.defineProperties(element, {
    className: {
      get() { return className; },
      set(value) {
        className = String(value || '');
        classList.setFromString(className);
        attributes.set('class', className);
      },
      enumerable: true,
      configurable: true,
    },
    innerHTML: {
      get() { return innerHTML; },
      set(value) {
        innerHTML = String(value ?? '');
        if (innerHTML === '') children.splice(0, children.length);
      },
      enumerable: true,
      configurable: true,
    },
    firstElementChild: {
      get() { return children[0] ?? null; },
      enumerable: true,
      configurable: true,
    },
  });

  return element;
}

export function createFakeDocument() {
  const elementsById = new Map();
  const head = createFakeElement('head');
  const body = createFakeElement('body');
  return {
    readyState: 'complete',
    hidden: false,
    head,
    body,
    documentElement: createFakeElement('html'),
    scripts: [],
    styleSheets: [],
    createElement: createFakeElement,
    getElementById(id) {
      const direct = elementsById.get(String(id));
      if (direct) return direct;
      return body.querySelector(`#${id}`) || head.querySelector(`#${id}`) || null;
    },
    registerElement(id, element = createFakeElement()) { element.id = String(id); elementsById.set(String(id), element); return element; },
    querySelector(selector) { return body.querySelector(selector) || head.querySelector(selector); },
    querySelectorAll(selector) { return [...body.querySelectorAll(selector), ...head.querySelectorAll(selector)]; },
    addEventListener() {},
    removeEventListener() {},
  };
}

export function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    removeEventListener(type, fn) { const list = listeners.get(type) || []; listeners.set(type, list.filter(item => item !== fn)); },
    dispatchEvent(event) { for (const fn of listeners.get(event?.type) || []) fn.call(this, event); return true; },
  };
}

export function installBrowserGlobals({ href = 'https://www.yuketang.cn/web', storage = {}, gmRequest = null } = {}) {
  const document = createFakeDocument();
  const events = createEventTarget();
  const url = new URL(href);
  const localStorage = createMemoryStorage(storage);
  const requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
  const cancelAnimationFrame = handle => clearTimeout(handle);
  const window = {
    ...events,
    document,
    localStorage,
    location: {
      href: url.href,
      origin: url.origin,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      assign(next) { this.href = String(next); },
      replace(next) { this.href = String(next); },
      reload() {},
    },
    history: { pushState() {}, replaceState() {} },
    navigator: {},
    unsafeWindow: null,
    GM_xmlhttpRequest: gmRequest,
    GM_notification: undefined,
    GM_addStyle: undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame,
    cancelAnimationFrame,
  };
  window.window = window;
  window.unsafeWindow = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  globalThis.location = window.location;
  globalThis.requestAnimationFrame = requestAnimationFrame;
  globalThis.cancelAnimationFrame = cancelAnimationFrame;
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
  globalThis.HTMLElement = class HTMLElement {};
  globalThis.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  return { window, document, localStorage };
}

export function uninstallBrowserGlobals() {
  for (const key of ['window', 'document', 'localStorage', 'location', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'CustomEvent', 'Event', 'HTMLElement', 'MutationObserver', 'XMLHttpRequest']) {
    try { delete globalThis[key]; } catch {}
  }
}

export function createGmRequestRecorder() {
  const calls = [];
  const queue = [];
  const fn = options => {
    calls.push(options);
    const next = queue.shift();
    if (!next) return { abort() {} };
    queueMicrotask(() => {
      if (next.type === 'error') options.onerror?.(next.error || new Error('network error'));
      else if (next.type === 'timeout') options.ontimeout?.();
      else options.onload?.({ status: next.status ?? 200, responseText: typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {}) });
    });
    return { abort() {} };
  };
  return {
    fn,
    calls,
    respond(body, status = 200) { queue.push({ type: 'load', body, status }); },
    fail(error) { queue.push({ type: 'error', error }); },
    timeout() { queue.push({ type: 'timeout' }); },
  };
}

export function createXMLHttpRequestRecorder() {
  const calls = [];
  const queue = [];
  class FakeXMLHttpRequest {
    constructor() {
      this.headers = {};
      this.responseText = '';
      this.status = 0;
      this.timeout = 0;
      this.onload = null;
      this.onerror = null;
      this.ontimeout = null;
      this.method = null;
      this.url = null;
      this.body = null;
      calls.push(this);
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      this.body = body;
      const next = queue.shift();
      queueMicrotask(() => {
        if (!next || next.type === 'error') { this.onerror?.(next?.error || new Error('network error')); return; }
        if (next.type === 'timeout') { this.ontimeout?.(); return; }
        this.status = next.status ?? 200;
        this.responseText = typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});
        this.onload?.();
      });
    }
  }
  return {
    FakeXMLHttpRequest,
    calls,
    respond(body, status = 200) { queue.push({ type: 'load', body, status }); },
    fail(error) { queue.push({ type: 'error', error }); },
    timeout() { queue.push({ type: 'timeout' }); },
  };
}
