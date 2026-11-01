// store.js —— 全量数据唯一持有者：mutate 入口、双档防抖落盘、失败重试、冲突重发
import { api } from './api.js';
import { clone, nowClock, stripPending } from './utils.js';

export function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  if (typeof document !== 'undefined') {
    document.body.dataset.theme = value;
    document.documentElement.dataset.theme = value;
  }
}

export class Store {
  constructor(client = api, options = {}) {
    this.client = client;
    this.shortDelay = options.shortDelay || 300;
    this.longDelay = options.longDelay || 1000;
    this.retryDelays = options.retryDelays || [2000, 5000, 10000];
    this.data = null;
    this.updatedAt = null;
    this.dirty = false;
    this.savedAt = null;
    this.initialized = false;
    this._revision = 0;
    this._saveTimer = null;
    this._retryTimer = null;
    this._retryIndex = 0;
    this._saving = false;
    this._queued = false;
    this._savePromise = null;
    this._conflictRetried = false;
    this._savedListeners = [];
    this._errorListeners = [];
  }

  init(data, updatedAt) {
    this.data = data;
    this.updatedAt = updatedAt || null;
    this.dirty = false;
    this.initialized = true;
    applyTheme(data && data.settings ? data.settings.theme : 'light');
  }

  replace(data, updatedAt) {
    this.data = data;
    this.updatedAt = updatedAt || null;
    this.dirty = false;
    applyTheme(data && data.settings ? data.settings.theme : 'light');
  }

  /** 唯一修改入口：fn(data) 同步修改；返回 fn 的返回值 */
  mutate(fn, opts = {}) {
    if (!this.data) throw new Error('数据尚未加载');
    const result = fn(this.data);
    this.dirty = true;
    this._revision += 1;
    this._scheduleSave(opts.long ? this.longDelay : this.shortDelay);
    return result;
  }

  _scheduleSave(delay) {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush();
    }, delay);
  }

  async flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (!this.dirty || !this.data) return true;
    if (this._saving) {
      this._queued = true;
      return this._savePromise;
    }
    this._saving = true;
    this._queued = false;
    this._savePromise = this._doSave();
    try {
      return await this._savePromise;
    } finally {
      this._saving = false;
      this._savePromise = null;
      if (this._queued) {
        this._queued = false;
        this._scheduleSave(0);
      }
    }
  }

  async flushNow() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    return this.flush();
  }

  async _doSave() {
    const revision = this._revision;
    const payload = stripPending(clone(this.data));
    try {
      const res = await this.client.saveData(this.updatedAt, payload);
      this.updatedAt = res.updatedAt;
      this.savedAt = nowClock();
      this._retryIndex = 0;
      this._conflictRetried = false;
      if (this._revision === revision) this.dirty = false;
      this._emitSaved(this.savedAt);
      if (this.dirty) this._scheduleSave(0);
      return true;
    } catch (err) {
      if (err && err.status === 409 && !this._conflictRetried) {
        this._conflictRetried = true;
        const server = err.payload && err.payload.serverUpdatedAt;
        if (server) this.updatedAt = server;
        return this._doSave();
      }
      this._conflictRetried = false;
      const delay = this.retryDelays[Math.min(this._retryIndex, this.retryDelays.length - 1)];
      this._retryIndex += 1;
      this._emitError(err);
      if (!this._retryTimer) {
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          this.flush();
        }, delay);
      }
      return false;
    }
  }

  onSaved(fn) {
    this._savedListeners.push(fn);
    return () => {
      this._savedListeners = this._savedListeners.filter((item) => item !== fn);
    };
  }

  onError(fn) {
    this._errorListeners.push(fn);
    return () => {
      this._errorListeners = this._errorListeners.filter((item) => item !== fn);
    };
  }

  _emitSaved(clock) {
    this._savedListeners.slice().forEach((fn) => {
      try { fn(clock); } catch (err) { /* 忽略监听器异常 */ }
    });
  }

  _emitError(err) {
    const message = (err && err.message) ? err.message : '保存失败，请重试或检查数据文件';
    this._errorListeners.slice().forEach((fn) => {
      try { fn(message, err); } catch (e) { /* 忽略监听器异常 */ }
    });
  }

  setTheme(theme) {
    this.mutate((data) => {
      data.settings.theme = theme === 'dark' ? 'dark' : 'light';
    });
    applyTheme(theme);
  }

  /** 关闭页面前的兜底负载（不含下划线临时字段） */
  beaconPayload() {
    if (!this.data) return null;
    return JSON.stringify({
      baseUpdatedAt: this.updatedAt,
      data: stripPending(clone(this.data)),
    });
  }
}

export function createStore(client) {
  return new Store(client);
}

export default Store;
