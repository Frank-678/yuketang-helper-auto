import { normalizeRuntimeConfig } from './config-normalization.js';

const PRIVATE_SECRETS_SUFFIX = 'private-secrets:v1';
const DEFAULT_LEGACY_PROFILE_ENDPOINT = 'https://api.moonshot.cn/v1/chat/completions';

const LEGACY_TRUSTED_ENDPOINT_HOSTS = new Set([
  'api.moonshot.cn',
  'api.openai.com',
  'api.deepseek.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

function canHydrateLegacyUnboundSecret(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname))) {
      return false;
    }
    return LEGACY_TRUSTED_ENDPOINT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function runtimeFunction(name) {
  const globalFn = typeof globalThis !== 'undefined' ? globalThis?.[name] : null;
  if (typeof globalFn === 'function') return globalFn.bind(globalThis);
  const windowFn = typeof window !== 'undefined' ? window?.[name] : null;
  return typeof windowFn === 'function' ? windowFn.bind(window) : null;
}

function createGMPrivateStore() {
  return {
    available() {
      return !!runtimeFunction('GM_getValue')
        && !!runtimeFunction('GM_setValue')
        && !!runtimeFunction('GM_deleteValue');
    },
    get(key, dv = null) {
      const fn = runtimeFunction('GM_getValue');
      return fn ? fn(key, dv) : dv;
    },
    set(key, value) {
      const fn = runtimeFunction('GM_setValue');
      if (!fn) return false;
      fn(key, value);
      return true;
    },
    remove(key) {
      const fn = runtimeFunction('GM_deleteValue');
      if (!fn) return false;
      fn(key);
      return true;
    },
  };
}

function normalizeSecretRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const profileApiKeys = {};
  const profileEndpoints = {};
  if (value.profileApiKeys && typeof value.profileApiKeys === 'object') {
    for (const [id, apiKey] of Object.entries(value.profileApiKeys)) {
      profileApiKeys[String(id)] = String(apiKey || '');
    }
  }
  if (value.profileEndpoints && typeof value.profileEndpoints === 'object') {
    for (const [id, endpoint] of Object.entries(value.profileEndpoints)) {
      profileEndpoints[String(id)] = String(endpoint || '');
    }
  }
  return {
    version: Number(value.version) >= 2 ? 2 : 1,
    profileApiKeys,
    profileEndpoints,
    ocrApiKey: String(value.ocrApiKey || ''),
    ocrEndpoint: String(value.ocrEndpoint || ''),
    translateApiKey: String(value.translateApiKey || ''),
    translateEndpoint: String(value.translateEndpoint || ''),
    legacyKimiApiKey: String(value.legacyKimiApiKey || ''),
  };
}

function collectProfileSecrets(target, profiles) {
  if (!Array.isArray(profiles)) return;
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') continue;
    const id = String(profile.id ?? '').trim();
    if (!id) continue;
    target[id] = String(profile.apiKey || '');
  }
}

function collectProfileEndpoints(target, profiles) {
  if (!Array.isArray(profiles)) return;
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') continue;
    const id = String(profile.id ?? '').trim();
    if (!id) continue;
    target[id] = String(profile.baseUrl || DEFAULT_LEGACY_PROFILE_ENDPOINT);
  }
}

function extractSecrets(config, separateLegacyKey = '') {
  const input = config && typeof config === 'object' ? config : {};
  const ai = input.ai && typeof input.ai === 'object' ? input.ai : {};
  const profileApiKeys = {};
  const profileEndpoints = {};
  collectProfileSecrets(profileApiKeys, input.profiles);
  collectProfileSecrets(profileApiKeys, ai.profiles);
  collectProfileEndpoints(profileEndpoints, input.profiles);
  collectProfileEndpoints(profileEndpoints, ai.profiles);
  return {
    version: 2,
    profileApiKeys,
    profileEndpoints,
    ocrApiKey: String(ai.ocrApiKey || ''),
    ocrEndpoint: String(ai.ocrApi || ''),
    translateApiKey: String(ai.translateApiKey || ''),
    translateEndpoint: String(ai.translateApi || ''),
    legacyKimiApiKey: String(ai.kimiApiKey || ai.apiKey || separateLegacyKey || ''),
  };
}

function hasSecretMaterial(config, separateLegacyKey = '') {
  const secrets = extractSecrets(config, separateLegacyKey);
  return !!secrets.legacyKimiApiKey
    || !!secrets.ocrApiKey
    || !!secrets.translateApiKey
    || Object.values(secrets.profileApiKeys).some(Boolean);
}

function mergeSecretRecords(localSecrets, privateSecrets) {
  const local = normalizeSecretRecord(localSecrets) || extractSecrets({});
  const existing = normalizeSecretRecord(privateSecrets);
  if (!existing) return local;
  return {
    version: Math.max(local.version || 1, existing.version || 1),
    profileApiKeys: {
      ...local.profileApiKeys,
      ...existing.profileApiKeys,
    },
    profileEndpoints: existing.version >= 2
      ? { ...local.profileEndpoints, ...existing.profileEndpoints }
      : { ...local.profileEndpoints },
    ocrApiKey: existing.ocrApiKey || local.ocrApiKey,
    ocrEndpoint: existing.version >= 2 ? (existing.ocrEndpoint || local.ocrEndpoint) : local.ocrEndpoint,
    translateApiKey: existing.translateApiKey || local.translateApiKey,
    translateEndpoint: existing.version >= 2 ? (existing.translateEndpoint || local.translateEndpoint) : local.translateEndpoint,
    legacyKimiApiKey: existing.legacyKimiApiKey || local.legacyKimiApiKey,
  };
}

function scrubProfileSecrets(profiles) {
  if (!Array.isArray(profiles)) return;
  for (const profile of profiles) {
    if (profile && typeof profile === 'object' && 'apiKey' in profile) profile.apiKey = '';
  }
}

function createLocalStorageConfigSnapshot(config) {
  const clean = clone(config && typeof config === 'object' ? config : {});
  scrubProfileSecrets(clean.profiles);
  if (clean.ai && typeof clean.ai === 'object') {
    scrubProfileSecrets(clean.ai.profiles);
    if ('kimiApiKey' in clean.ai) clean.ai.kimiApiKey = '';
    if ('apiKey' in clean.ai) clean.ai.apiKey = '';
    if ('ocrApiKey' in clean.ai) clean.ai.ocrApiKey = '';
    if ('translateApiKey' in clean.ai) clean.ai.translateApiKey = '';
  }
  return clean;
}

function hydrateSecrets(config, privateSecrets) {
  const secrets = normalizeSecretRecord(privateSecrets);
  if (!secrets) return config;
  const hydrated = clone(config);
  const profiles = Array.isArray(hydrated.ai?.profiles) ? hydrated.ai.profiles : [];
  for (const profile of profiles) {
    const id = String(profile?.id ?? '').trim();
    if (!id || !Object.prototype.hasOwnProperty.call(secrets.profileApiKeys, id)) continue;
    const privateKey = secrets.profileApiKeys[id];
    const boundEndpoint = String(secrets.profileEndpoints?.[id] || '').trim();
    if (boundEndpoint) {
      profile.baseUrl = boundEndpoint;
      profile.apiKey = privateKey;
    } else if (secrets.version < 2 && canHydrateLegacyUnboundSecret(profile.baseUrl)) {
      profile.apiKey = privateKey;
    } else {
      profile.apiKey = '';
    }
  }
  if (hydrated.ai && typeof hydrated.ai === 'object') {
    if (secrets.version >= 2) {
      hydrated.ai.ocrApi = secrets.ocrEndpoint;
      hydrated.ai.translateApi = secrets.translateEndpoint;
      hydrated.ai.ocrApiKey = secrets.ocrApiKey;
      hydrated.ai.translateApiKey = secrets.translateApiKey;
    } else {
      const localOcrEndpoint = String(hydrated.ai.ocrApi || '').trim();
      const localTranslateEndpoint = String(hydrated.ai.translateApi || '').trim();
      hydrated.ai.ocrApiKey = (!localOcrEndpoint || canHydrateLegacyUnboundSecret(localOcrEndpoint))
        ? secrets.ocrApiKey
        : '';
      hydrated.ai.translateApiKey = (!localTranslateEndpoint || canHydrateLegacyUnboundSecret(localTranslateEndpoint))
        ? secrets.translateApiKey
        : '';
    }
    const active = profiles.find(profile => String(profile?.id) === String(hydrated.ai.activeProfileId)) || profiles[0];
    const activeKey = String(active?.apiKey || '');
    hydrated.ai.kimiApiKey = activeKey || (canHydrateLegacyUnboundSecret(active?.baseUrl) ? secrets.legacyKimiApiKey : '');
    hydrated.ai.apiKey = activeKey || '';
  }
  hydrated.profiles = clone(profiles);
  hydrated.activeProfileId = hydrated.ai?.activeProfileId || hydrated.activeProfileId;
  return hydrated;
}

// src/core/storage.js
export class StorageManager {
  constructor(prefix, { privateStore = null } = {}) {
    this.prefix = prefix;
    this.privateStore = privateStore || createGMPrivateStore();
    this.privateSecretsKey = `${prefix}${PRIVATE_SECRETS_SUFFIX}`;
  }

  _readRaw(key, dv = null) {
    try {
      const v = localStorage.getItem(this.prefix + key);
      return v ? JSON.parse(v) : dv;
    } catch {
      return dv;
    }
  }

  _privateAvailable() {
    try { return !!this.privateStore?.available?.(); } catch { return false; }
  }

  _readPrivateSecrets() {
    if (!this._privateAvailable()) return null;
    try { return normalizeSecretRecord(this.privateStore.get(this.privateSecretsKey, null)); }
    catch { return null; }
  }

  _writePrivateSecrets(secrets) {
    if (!this._privateAvailable()) return false;
    const result = this.privateStore.set(this.privateSecretsKey, normalizeSecretRecord(secrets) || extractSecrets({}));
    return result !== false;
  }

  _removeLocalLegacyKey() {
    try { localStorage.removeItem(this.prefix + 'kimiApiKey'); } catch {}
  }

  _persistSanitizedConfig(value) {
    localStorage.setItem(this.prefix + 'config', JSON.stringify(createLocalStorageConfigSnapshot(value)));
    this._removeLocalLegacyKey();
  }

  get(key, dv = null) {
    if (key !== 'config') {
      if (key === 'kimiApiKey') {
        const privateSecrets = this._readPrivateSecrets();
        if (privateSecrets?.legacyKimiApiKey) return privateSecrets.legacyKimiApiKey;
      }
      return this._readRaw(key, dv);
    }

    const value = this._readRaw('config', dv);
    const legacyKimiApiKey = this._readRaw('kimiApiKey', '');
    const privateSecrets = this._readPrivateSecrets();
    const normalized = normalizeRuntimeConfig(value, {
      legacyKimiApiKey: privateSecrets?.legacyKimiApiKey || legacyKimiApiKey,
    });
    const runtimeConfig = hydrateSecrets(normalized, privateSecrets);

    // One-time migration from page-readable localStorage to userscript-private
    // GM storage. Never scrub the old copy until the private write succeeds.
    if (this._privateAvailable() && hasSecretMaterial(value, legacyKimiApiKey)) {
      try {
        const merged = mergeSecretRecords(extractSecrets(runtimeConfig, legacyKimiApiKey), privateSecrets);
        if (this._writePrivateSecrets(merged)) this._persistSanitizedConfig(value);
      } catch {
        // Preserve the only known local copy if private persistence fails.
      }
    }

    return runtimeConfig;
  }

  set(key, value) {
    if (key === 'config') {
      if (this._privateAvailable()) {
        const secrets = extractSecrets(value);
        if (!this._writePrivateSecrets(secrets)) throw new Error('private secret storage unavailable');
        this._persistSanitizedConfig(value);
        return;
      }
      if (hasSecretMaterial(value)) {
        throw new Error('private secret storage unavailable; refusing to persist credentials to localStorage');
      }
    }

    if (key === 'kimiApiKey') {
      if (this._privateAvailable()) {
        const current = this._readPrivateSecrets() || extractSecrets({});
        current.legacyKimiApiKey = String(value || '');
        if (!this._writePrivateSecrets(current)) throw new Error('private secret storage unavailable');
        this._removeLocalLegacyKey();
        return;
      }
      if (String(value || '')) {
        throw new Error('private secret storage unavailable; refusing to persist credentials to localStorage');
      }
    }

    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  remove(key) {
    if (key === 'kimiApiKey' && this._privateAvailable()) {
      const current = this._readPrivateSecrets();
      if (current) {
        current.legacyKimiApiKey = '';
        try { this._writePrivateSecrets(current); } catch {}
      }
    }
    localStorage.removeItem(this.prefix + key);
  }

  getMap(key) {
    const arr = this.get(key, []);
    try { return new Map(arr); } catch { return new Map(); }
  }
  setMap(key, map) { this.set(key, [...map]); }
  alterMap(key, fn) { const m = this.getMap(key); fn(m); this.setMap(key, m); }
}

export const storage = new StorageManager('ykt-helper:');
