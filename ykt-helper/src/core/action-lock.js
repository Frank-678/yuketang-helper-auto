export function createKeyedActionLock() {
  const pending = new Set();

  function normalizeKey(key) {
    if (key === null || key === undefined) return '';
    return String(key).trim();
  }

  return {
    acquire(key) {
      const normalized = normalizeKey(key);
      if (!normalized || pending.has(normalized)) return false;
      pending.add(normalized);
      return true;
    },

    release(key) {
      const normalized = normalizeKey(key);
      if (!normalized) return false;
      return pending.delete(normalized);
    },

    isPending(key) {
      const normalized = normalizeKey(key);
      return !!normalized && pending.has(normalized);
    },

    clear() {
      pending.clear();
    },

    get size() {
      return pending.size;
    },
  };
}
