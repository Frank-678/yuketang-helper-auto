const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseClock(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getWindowPoint(item) {
  if (typeof item === 'string') return parseClock(item);
  if (!item || typeof item !== 'object') return null;
  return parseClock(item.at ?? item.time);
}

function getWindowBounds(item) {
  const beforeMs = Number(item?.beforeMs);
  const afterMs = Number(item?.afterMs);
  return {
    beforeMs: Number.isFinite(beforeMs) ? Math.max(0, beforeMs) : MINUTE_MS,
    afterMs: Number.isFinite(afterMs) ? Math.max(0, afterMs) : 10 * MINUTE_MS,
  };
}

function localDayAt(date, dayOffset) {
  const day = new Date(date.getTime());
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOffset);
  return day;
}

/**
 * Whether a timestamp is inside any configured fast-answer window.
 * Windows use local browser time and are inclusive at both ends.
 */
export function isWithinAnswerPriorityWindow(now = Date.now(), windows = []) {
  const date = toDate(now);
  if (!date || !Array.isArray(windows)) return false;

  const current = date.getTime();
  for (const item of windows) {
    const minutes = getWindowPoint(item);
    if (minutes === null) continue;
    const { beforeMs, afterMs } = getWindowBounds(item);

    for (let dayOffset = -2; dayOffset <= 2; dayOffset += 1) {
      const point = localDayAt(date, dayOffset).getTime() + minutes * MINUTE_MS;
      if (current >= point - beforeMs && current <= point + afterMs) return true;
    }
  }
  return false;
}

function getProfiles(aiConfig) {
  const profiles = Array.isArray(aiConfig?.profiles) ? aiConfig.profiles : [];
  return profiles.filter(profile => profile && typeof profile === 'object');
}

function getActiveProfile(profiles, activeProfileId) {
  return profiles.find(profile => profile.id === activeProfileId) || profiles[0] || null;
}

/**
 * Pick the profile for one stage of an answer attempt.
 * A missing or invalid special profile falls back to the active profile.
 */
export function selectAnswerProfile(aiConfig, {
  role = 'active',
  now = Date.now(),
  windows = [],
  fastProfileId = aiConfig?.fastAnswerProfileId,
  verifyProfileId = aiConfig?.verifyAnswerProfileId,
} = {}) {
  const profiles = getProfiles(aiConfig);
  const active = getActiveProfile(profiles, aiConfig?.activeProfileId);
  if (!active) return null;

  if (role === 'fast' && isWithinAnswerPriorityWindow(now, windows)) {
    return profiles.find(profile => profile.id === fastProfileId) || active;
  }
  if (role === 'verify') {
    return profiles.find(profile => profile.id === verifyProfileId) || active;
  }
  return active;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeAnswer(problem, answer) {
  if (Array.isArray(answer)) {
    const values = answer.map(value => normalizeText(value));
    return Number(problem?.problemType) === 2 ? values.sort() : values;
  }

  if (answer && typeof answer === 'object') {
    if ('content' in answer) return { content: normalizeText(answer.content) };
    return Object.keys(answer).sort().reduce((result, key) => {
      result[key] = normalizeAnswer(problem, answer[key]);
      return result;
    }, {});
  }

  return normalizeText(answer);
}

/** Compare two parsed answers while ignoring formatting-only differences. */
export function compareParsedAnswers(problem, first, second) {
  return JSON.stringify(normalizeAnswer(problem, first)) === JSON.stringify(normalizeAnswer(problem, second));
}
