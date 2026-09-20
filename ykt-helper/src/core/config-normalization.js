import { DEFAULT_CONFIG } from './types.js';

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function validProfiles(value) {
  return Array.isArray(value) && value.some(profile => profile && typeof profile === 'object');
}

function normalizeProfiles(saved = {}, ai = {}, legacyKimiApiKey = '') {
  let profiles;
  if (validProfiles(ai.profiles)) profiles = clone(ai.profiles);
  else if (validProfiles(saved.profiles)) profiles = clone(saved.profiles);
  else if (validProfiles(DEFAULT_CONFIG.profiles)) profiles = clone(DEFAULT_CONFIG.profiles);
  else profiles = [];

  const legacyKey = String(
    legacyKimiApiKey
      || ai.kimiApiKey
      || ai.apiKey
      || '',
  );

  if (!profiles.length) {
    profiles.push({
      id: 'default',
      name: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
      apiKey: legacyKey,
      model: 'moonshot-v1-8k',
      visionModel: 'moonshot-v1-8k-vision-preview',
      temperature: '',
    });
  } else if (legacyKey && !profiles.some(profile => String(profile?.apiKey || '').trim())) {
    profiles[0] = { ...profiles[0], apiKey: legacyKey };
  }

  const requestedActiveId = ai.activeProfileId ?? saved.activeProfileId ?? DEFAULT_CONFIG.activeProfileId;
  const requested = requestedActiveId == null ? '' : String(requestedActiveId);
  const matching = profiles.find(profile => String(profile?.id) === requested);
  const activeProfileId = String((matching || profiles[0])?.id || 'default');
  return { profiles, activeProfileId };
}

/**
 * Normalize persisted configuration into the single runtime shape used by the
 * userscript. This is intentionally pure so legacy migrations can be covered
 * by unit tests without mounting UI.
 */
export function normalizeRuntimeConfig(saved = {}, { legacyKimiApiKey = '' } = {}) {
  const input = saved && typeof saved === 'object' ? saved : {};
  const savedAI = input.ai && typeof input.ai === 'object' ? input.ai : {};
  const ai = {
    ...clone(DEFAULT_CONFIG.ai || {}),
    ...clone(savedAI),
  };
  const { profiles, activeProfileId } = normalizeProfiles(input, ai, legacyKimiApiKey);
  ai.profiles = profiles;
  ai.activeProfileId = activeProfileId;
  if (legacyKimiApiKey && !ai.kimiApiKey) ai.kimiApiKey = legacyKimiApiKey;

  return {
    ...clone(DEFAULT_CONFIG),
    ...clone(input),
    ai,
    // Keep legacy mirrors for older UI/code paths, but ai.* is authoritative.
    profiles: clone(profiles),
    activeProfileId,
  };
}
