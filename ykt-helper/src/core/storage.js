// src/core/storage.js
export class StorageManager {
  constructor(prefix) { this.prefix = prefix; }
  get(key, dv = null) {
    try { const v = localStorage.getItem(this.prefix + key); return v ? JSON.parse(v) : dv; }
    catch { return dv; }
  }
  set(key, value) {
    const encoded = JSON.stringify(value);
    try { localStorage.setItem(this.prefix + key, encoded); }
    catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error;
      // Only reproducible presentation caches are evicted; never drafts/settings.
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.prefix + 'presentations-') && k !== this.prefix + key) keys.push(k); }
      for (const k of keys) { localStorage.removeItem(k); try { localStorage.setItem(this.prefix + key, encoded); return; } catch {} }
      throw error;
    }
  }
  remove(key) { localStorage.removeItem(this.prefix + key); }

  getMap(key) {
    const arr = this.get(key, []); 
    try { return new Map(arr); } catch { return new Map(); }
  }
  setMap(key, map) { this.set(key, [...map]); }
  alterMap(key, fn) { const m = this.getMap(key); fn(m); this.setMap(key, m); }
}

export const storage = new StorageManager('ykt-helper:');
