import { sendDanmuText } from './danmu-sender.js';

const DEFAULTS = {
  windowSize: 7,
  burstWindowMs: 30_000,
  roundGapMs: 60_000,
  maxSendsPerRound: 2,
};

export const DANMU_FOLLOW_DEFAULTS = DEFAULTS;

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
 * Tracks classroom barrage round boundaries without applying follow rules.
 * The first observed message starts round 1 silently; a later message starts
 * a new round when the adjacent gap reaches the configured roundGapMs.
 */
export function createDanmuRoundTracker(options = {}) {
  const roundGapMs = finitePositive(options.roundGapMs, DEFAULTS.roundGapMs);
  let lastAt = null;
  let roundNumber = 0;

  function reset() {
    lastAt = null;
    roundNumber = 0;
  }

  function observe(at = Date.now()) {
    const timestamp = Number(at);
    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    const roundStarted = lastAt !== null && now - lastAt >= roundGapMs;

    if (lastAt === null || roundStarted) roundNumber += 1;
    lastAt = now;

    return {
      roundStarted,
      roundNumber,
      at: now,
    };
  }

  return {
    observe,
    reset,
    getSnapshot() {
      return { lastAt, roundNumber };
    },
  };
}

/**
 * Tracks one classroom's barrage stream.
 * A round continues while each adjacent non-empty message is less than the
 * configured gap apart.  Once windowSize consecutive messages are available,
 * they must fit inside burstWindowMs; the most frequent exact text wins, with
 * the newest text breaking ties.  Each completed burst is consumed so one
 * message cannot trigger twice.
 */
export function createDanmuFollowTracker(options = {}) {
  const windowSize = Math.max(1, Math.floor(finitePositive(options.windowSize, DEFAULTS.windowSize)));
  const burstWindowMs = finitePositive(
    options.burstWindowMs ?? options.windowMs,
    DEFAULTS.burstWindowMs,
  );
  const roundGapMs = finitePositive(options.roundGapMs, DEFAULTS.roundGapMs);
  const maxSendsPerRound = Math.max(0, Math.floor(Number.isFinite(Number(options.maxSendsPerRound))
    ? Number(options.maxSendsPerRound)
    : DANMU_FOLLOW_DEFAULTS.maxSendsPerRound));

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
    if (lastAt !== null && (now < lastAt || now - lastAt >= roundGapMs)) reset();

    messages.push({ text, at: now });
    if (messages.length > windowSize) messages = messages.slice(-windowSize);
    lastAt = now;

    const currentCount = messages.reduce((total, item) => total + (item.text === text ? 1 : 0), 0);
    if (messages.length < windowSize) return result(false, text, currentCount, 'burst-size');

    const burstAge = now - messages[0].at;
    if (burstAge > burstWindowMs) return result(false, text, currentCount, 'burst-window');

    const counts = new Map();
    for (const item of messages) counts.set(item.text, (counts.get(item.text) || 0) + 1);

    let winnerText = messages[messages.length - 1].text;
    let winnerCount = counts.get(winnerText) || 0;
    let winnerIndex = messages.length - 1;
    messages.forEach((item, index) => {
      const count = counts.get(item.text) || 0;
      if (count > winnerCount || (count === winnerCount && index >= winnerIndex)) {
        winnerText = item.text;
        winnerCount = count;
        winnerIndex = index;
      }
    });

    if (followedTexts.has(winnerText)) return result(false, winnerText, winnerCount, 'already-followed');
    if (sentCount >= maxSendsPerRound) return result(false, winnerText, winnerCount, 'round-limit');

    followedTexts.add(winnerText);
    sentCount += 1;
    messages = [];
    return {
      ...result(true, winnerText, winnerCount),
      batchSize: windowSize,
      burstWindowMs,
    };
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
  const roundTracker = options.roundTracker || createDanmuRoundTracker(options);
  const enabled = options.enabled === undefined ? () => true : options.enabled;
  const send = options.send || (text => sendDanmuText(text));
  const getCurrentUserId = options.getCurrentUserId || (() => null);
  const getNow = options.now || (() => Date.now());
  const ownEchoTtlMs = finitePositive(options.ownEchoTtlMs, 10_000);
  const onRoundStart = typeof options.onRoundStart === 'function' ? options.onRoundStart : null;
  const onFollowTrigger = typeof options.onFollowTrigger === 'function' ? options.onFollowTrigger : null;
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

  async function handle(message, { notificationOnly = false } = {}) {
    const parsed = extractDanmuMessage(message);
    if (!parsed) return { handled: false, triggered: false, reason: 'not-danmu' };

    if (notificationOnly) {
      return { handled: true, triggered: false, text: parsed.text, reason: 'notification-only' };
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

    const round = roundTracker.observe(now);
    if (round.roundStarted) {
      try {
        onRoundStart?.({ ...round, text: parsed.text });
      } catch {}
    }

    if (!isEnabled()) {
      tracker.reset();
      pendingOwn.clear();
      return {
        handled: true,
        triggered: false,
        text: parsed.text,
        roundNumber: round.roundNumber,
        at: round.at,
        roundStarted: round.roundStarted,
        reason: 'disabled',
      };
    }

    const observation = tracker.observe(parsed.text, now);
    const enriched = {
      ...observation,
      roundNumber: round.roundNumber,
      at: round.at,
    };
    if (!observation.triggered) {
      return { handled: true, ...enriched };
    }

    try {
      onFollowTrigger?.(enriched);
    } catch {}

    let sendResult;
    try {
      sendResult = send(observation.text);
    } catch (error) {
      sendResult = { sent: false, text: observation.text, reason: 'send-error', error };
    }

    const finalize = resolved => {
      if (
        resolved === true
        || (resolved?.sent === true && resolved?.verified !== false)
      ) rememberOwn(observation.text, now);
      return { handled: true, ...enriched, sendResult: resolved };
    };

    if (sendResult && typeof sendResult.then === 'function') {
      return sendResult.then(finalize, error => finalize({
        sent: false,
        text: observation.text,
        reason: 'send-error',
        error,
      }));
    }

    return finalize(sendResult);
  }

  return {
    handle,
    reset() {
      tracker.reset();
      roundTracker.reset();
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
