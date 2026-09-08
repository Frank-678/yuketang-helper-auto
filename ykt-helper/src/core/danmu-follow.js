import { sendDanmuText } from './danmu-sender.js';

const DEFAULTS = {
  windowSize: 7,
  threshold: 3,
  roundGapMs: 60_000,
  maxSendsPerRound: 2,
};

function normalizeOp(message) {
  return String(message?.op || message?.type || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** Extract the native Rain Classroom newdanmu payload without changing text. */
export function extractDanmuMessage(message) {
  if (normalizeOp(message) !== 'newdanmu') return null;
  const candidates = [message];
  for (const key of ['msg', 'data', 'message', 'payload']) {
    const candidate = message?.[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      candidates.push(candidate);
    }
  }

  const payload = candidates.find(candidate => typeof candidate?.danmu === 'string');
  if (!payload) return null;

  const text = payload.danmu;
  const rawUserId = candidates
    .map(candidate => candidate?.userid ?? candidate?.userId ?? candidate?.user_id ?? candidate?.uid)
    .find(value => value !== undefined && value !== null);
  return {
    text,
    userId: rawUserId === undefined || rawUserId === null ? null : String(rawUserId),
  };
}

/**
 * Tracks one classroom's barrage stream.
 * A round continues while each adjacent non-empty message is less than the
 * configured gap apart.  The detector only remembers the latest windowSize
 * messages and emits at most one trigger per text and maxSendsPerRound total.
 */
export function createDanmuFollowTracker(options = {}) {
  const windowSize = Math.max(1, Math.floor(finitePositive(options.windowSize, DEFAULTS.windowSize)));
  const threshold = Math.max(1, Math.floor(finitePositive(options.threshold, DEFAULTS.threshold)));
  const roundGapMs = finitePositive(options.roundGapMs, DEFAULTS.roundGapMs);
  const maxSendsPerRound = Math.max(0, Math.floor(Number.isFinite(Number(options.maxSendsPerRound))
    ? Number(options.maxSendsPerRound)
    : DEFAULTS.maxSendsPerRound));

  let messages = [];
  let lastAt = null;
  let sentCount = 0;
  let followedTexts = new Set();

  function reset() {
    messages = [];
    lastAt = null;
    sentCount = 0;
    followedTexts = new Set();
  }

  function result(triggered, text, count, reason) {
    const payload = {
      triggered,
      text,
      count,
      sentCount,
    };
    if (reason) payload.reason = reason;
    return payload;
  }

  function observe(text, at = Date.now()) {
    if (typeof text !== 'string' || !text.trim()) {
      return result(false, text, 0, 'empty');
    }

    const timestamp = Number(at);
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (lastAt !== null && now - lastAt >= roundGapMs) reset();

    messages.push({ text, at: now });
    if (messages.length > windowSize) messages = messages.slice(-windowSize);
    lastAt = now;

    const count = messages.reduce((total, item) => total + (item.text === text ? 1 : 0), 0);
    if (count < threshold) return result(false, text, count, 'threshold');
    if (followedTexts.has(text)) return result(false, text, count, 'already-followed');
    if (sentCount >= maxSendsPerRound) return result(false, text, count, 'round-limit');

    followedTexts.add(text);
    sentCount += 1;
    return result(true, text, count);
  }

  return {
    observe,
    reset,
    getSnapshot() {
      return {
        messages: messages.slice(),
        lastAt,
        sentCount,
        followedTexts: new Set(followedTexts),
      };
    },
  };
}

/**
 * Connects the protocol parser, tracker, and page sender while keeping own
 * echoes out of the class-wide message stream.
 */
export function createDanmuFollowController(options = {}) {
  const tracker = options.tracker || createDanmuFollowTracker(options);
  const enabled = options.enabled === undefined ? () => true : options.enabled;
  const send = options.send || (text => sendDanmuText(text));
  const getCurrentUserId = options.getCurrentUserId || (() => null);
  const getNow = options.now || (() => Date.now());
  const ownEchoTtlMs = finitePositive(options.ownEchoTtlMs, 10_000);
  const pendingOwn = new Map();

  function isEnabled() {
    try {
      return typeof enabled === 'function' ? enabled() !== false : enabled !== false;
    } catch {
      return false;
    }
  }

  function currentUserId() {
    try {
      const value = getCurrentUserId();
      return value === undefined || value === null || String(value).trim() === ''
        ? null
        : String(value);
    } catch {
      return null;
    }
  }

  function rememberOwn(text, at) {
    pendingOwn.set(text, { at, count: (pendingOwn.get(text)?.count || 0) + 1 });
  }

  function consumeOwnEcho(text, at) {
    const pending = pendingOwn.get(text);
    if (!pending) return false;
    if (at - pending.at > ownEchoTtlMs || at < pending.at) {
      pendingOwn.delete(text);
      return false;
    }
    if (pending.count <= 1) pendingOwn.delete(text);
    else pending.count -= 1;
    return true;
  }

  function handle(message, { notificationOnly = false } = {}) {
    const parsed = extractDanmuMessage(message);
    if (!parsed) return { handled: false, triggered: false, reason: 'not-danmu' };

    if (notificationOnly) {
      return { handled: true, triggered: false, text: parsed.text, reason: 'notification-only' };
    }

    if (!isEnabled()) {
      tracker.reset();
      pendingOwn.clear();
      return { handled: true, triggered: false, text: parsed.text, reason: 'disabled' };
    }

    const rawNow = Number(getNow());
    const now = Number.isFinite(rawNow) ? rawNow : Date.now();
    const ownId = currentUserId();
    if (ownId !== null && parsed.userId !== null && ownId === parsed.userId) {
      return { handled: true, triggered: false, text: parsed.text, reason: 'own' };
    }
    if (parsed.userId === null && consumeOwnEcho(parsed.text, now)) {
      return { handled: true, triggered: false, text: parsed.text, reason: 'own-echo' };
    }

    const observation = tracker.observe(parsed.text, now);
    if (!observation.triggered) return { handled: true, ...observation };

    let sendResult;
    try {
      sendResult = send(parsed.text);
    } catch (error) {
      sendResult = { sent: false, text: parsed.text, reason: 'send-error', error };
    }
    if (sendResult === true || sendResult?.sent === true) rememberOwn(parsed.text, now);

    return { handled: true, ...observation, sendResult };
  }

  return {
    handle,
    reset() {
      tracker.reset();
      pendingOwn.clear();
    },
    getSnapshot() {
      return {
        tracker: tracker.getSnapshot?.(),
        pendingOwn: new Map(pendingOwn),
      };
    },
  };
}
