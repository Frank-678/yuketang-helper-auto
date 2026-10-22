import { sendDanmuText } from './danmu-sender.js';
export function extractDanmuMessage(message) {
  if (String(message?.op || message?.type || '').replace(/[^a-z]/gi, '').toLowerCase() !== 'newdanmu') return null;
  const parts = [message, message.data, message.msg, message.message, message.payload].filter(Boolean);
  const p = parts.find(x => typeof x.danmu === 'string'); if (!p) return null;
  const userId = parts.map(x => x.userid ?? x.userId ?? x.user_id ?? x.uid).find(x => x != null);
  return { text: p.danmu, userId: userId == null ? null : String(userId) };
}
export function createDanmuFollowTracker(options = {}) {
  const size = options.windowSize || 7, windowMs = options.windowMs || 30000, roundMs = options.roundGapMs || 60000, max = options.maxSendsPerRound ?? 2;
  let messages = [], roundStart = null, lastAt = null, sentCount = 0, generation = 0;
  const followedTexts = new Set(), reservations = new Map();
  function reset() { messages = []; roundStart = lastAt = null; sentCount = 0; followedTexts.clear(); reservations.clear(); generation++; }
  return {
    reset,
    observe(text, at = Date.now()) {
      if (typeof text !== 'string' || !text.trim()) return { triggered: false, reason: 'empty' };
      if (lastAt != null && (at < lastAt || at - lastAt >= roundMs || at - roundStart >= roundMs)) reset();
      if (roundStart == null) roundStart = at;
      lastAt = at; messages = messages.filter(x => at - x.at <= windowMs); messages.push({ text, at });
      if (messages.length < size) return { triggered: false, reason: 'window', sentCount };
      const batch = messages.slice(-size); messages = [];
      const counts = new Map(); for (const x of batch) counts.set(x.text, (counts.get(x.text) || 0) + 1);
      let chosen = batch.at(-1).text; for (const x of batch) if ((counts.get(x.text) || 0) >= counts.get(chosen)) chosen = x.text;
      if (followedTexts.has(chosen) || [...reservations.values()].some(r => r.text === chosen)) return { triggered: false, text: chosen, reason: 'already-followed', sentCount };
      if (sentCount + reservations.size >= max) return { triggered: false, text: chosen, reason: 'round-limit', sentCount };
      const token = `${generation}:${at}:${Math.random()}`; reservations.set(token, { text: chosen, generation });
      return { triggered: true, text: chosen, count: counts.get(chosen), token, sentCount };
    },
    settle(token, result) {
      const entry = reservations.get(token); if (!entry) return;
      reservations.delete(token);
      if (entry.generation !== generation) return;
      // Definite pre-send failures roll back. Unknown outbound outcomes reserve quota.
      if (result === true || result?.sent || result?.unknown) { sentCount++; followedTexts.add(entry.text); }
    },
    getSnapshot() { return { messages: [...messages], lastAt, roundStart, sentCount, followedTexts: new Set(followedTexts), pending: reservations.size }; },
  };
}
export function createDanmuFollowController(options = {}) {
  const tracker = options.tracker || createDanmuFollowTracker(options), pendingOwn = new Map();
  const enabled = () => typeof options.enabled === 'function' ? options.enabled() : options.enabled !== false;
  let generation = 0;
  return {
    async handle(message, { notificationOnly = false } = {}) {
      const p = extractDanmuMessage(message); if (!p) return { handled: false, triggered: false };
      if (!enabled() || notificationOnly) { tracker.reset(); return { handled: true, triggered: false, reason: 'disabled' }; }
      const now = options.now?.() ?? Date.now(), ownId = options.getCurrentUserId?.();
      if (ownId != null && p.userId === String(ownId)) return { triggered: false, reason: 'own' };
      for (const [text, until] of pendingOwn) if (until < now) pendingOwn.delete(text);
      if (p.userId == null && pendingOwn.has(p.text)) { pendingOwn.delete(p.text); return { triggered: false, reason: 'own-echo' }; }
      const observation = tracker.observe(p.text, now); if (!observation.triggered) return { handled: true, ...observation };
      const initialGeneration = generation;
      let sendResult;
      try {
        if (!enabled()) sendResult = { sent: false, reason: 'disabled' };
        else { pendingOwn.set(observation.text, now + 10000); sendResult = await (options.send || sendDanmuText)(observation.text); }
      } catch (error) { sendResult = { sent: false, reason: 'send-error', error }; }
      if (generation === initialGeneration) tracker.settle(observation.token, sendResult);
      if (!sendResult?.sent && !sendResult?.unknown) pendingOwn.delete(observation.text);
      return { handled: true, ...observation, sendResult, sentCount: tracker.getSnapshot().sentCount };
    },
    reset() { generation++; tracker.reset(); pendingOwn.clear(); },
    getSnapshot() { return { tracker: tracker.getSnapshot(), pendingOwn: new Map(pendingOwn) }; },
  };
}
