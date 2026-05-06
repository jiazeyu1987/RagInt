import { backendUrl, fetchJson } from '../api/backendClient';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (err) => String((err && err.message) || err || 'offline_play_failed');

const validateManifest = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('offline_manifest_invalid');
  }
  if (data.ok === false) {
    throw new Error(String(data.error || data.message || 'offline_manifest_response_failed'));
  }
  if (!Array.isArray(data.items)) {
    throw new Error('offline_manifest_items_invalid');
  }
  return data;
};

export class OfflineScriptPlayer {
  constructor({ clientIdRef, emitClientEvent } = {}) {
    this._clientIdRef = clientIdRef || null;
    this._emitClientEvent = typeof emitClientEvent === 'function' ? emitClientEvent : null;
    this._token = 0;
    this._audio = null;
    this._playing = false;
    this._manifest = null;
    this._sessionId = null;
  }

  isPlaying() {
    return !!this._playing;
  }

  async loadManifest() {
    const data = await fetchJson('/api/offline/manifest');
    this._manifest = validateManifest(data);
    return this._manifest;
  }

  stop(reason) {
    this._token += 1;
    this._playing = false;
    try {
      if (this._audio) {
        try {
          this._audio.pause();
        } catch (_) {
          // ignore
        }
        try {
          this._audio.src = '';
        } catch (_) {
          // ignore
        }
      }
    } finally {
      this._audio = null;
    }
    this._emit('offline_play_cancelled', { reason: String(reason || 'stop') });
    this._sessionId = null;
  }

  async playAll() {
    const token = ++this._token;
    this._playing = true;
    this._sessionId = `offline_${Date.now()}`;

    let manifest;
    try {
      manifest = this._manifest ? validateManifest(this._manifest) : await this.loadManifest();
    } catch (e) {
      this._playing = false;
      this._sessionId = null;
      this._emit('offline_play_failed', { error: errorMessage(e) });
      throw e;
    }
    const items = manifest.items;
    if (!items.length) {
      this._playing = false;
      this._emit('offline_play_failed', { error: 'manifest_empty' });
      return { ok: false, error: 'manifest_empty' };
    }

    this._emit('offline_play_start', { count: items.length, title: manifest && manifest.title ? String(manifest.title) : '' });

    try {
      for (let i = 0; i < items.length; i += 1) {
        if (this._token !== token) return { ok: false, cancelled: true };
        const it = items[i] || {};
        const itemId = String(it.id || '').trim() || String(i);
        const stopId = it.stop_id ? String(it.stop_id) : '';
        const stopName = it.stop_name ? String(it.stop_name) : '';
        const url = it.audio_url ? String(it.audio_url) : backendUrl(`/api/offline/audio/${encodeURIComponent(itemId)}`);
        this._emit('offline_item_start', { index: i, item_id: itemId, stop_id: stopId, stop_name: stopName, url });

        const audio = new Audio(url);
        this._audio = audio;

        await new Promise((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('audio_play_failed'));
          audio.onpause = () => {};
          audio.play().then(resolve).catch(reject);
        }).catch((e) => {
          this._emit('offline_item_failed', { index: i, item_id: itemId, stop_id: stopId, stop_name: stopName, err: String(e && e.message ? e.message : e) });
          throw e;
        });

        // Wait for ended if play() resolved immediately (browser behavior differs).
        while (this._token === token && !audio.ended) {
          await sleep(50);
        }

        if (this._token !== token) return { ok: false, cancelled: true };
        this._emit('offline_item_end', { index: i, item_id: itemId, stop_id: stopId, stop_name: stopName });
        this._audio = null;
      }

      this._emit('offline_play_end', { count: items.length });
      return { ok: true };
    } finally {
      if (this._token === token) this._playing = false;
      if (this._token === token) this._sessionId = null;
      try {
        if (this._audio) {
          this._audio.pause();
          this._audio.src = '';
        }
      } catch (_) {
        // ignore
      } finally {
        this._audio = null;
      }
    }
  }

  _emit(name, fields) {
    if (!this._emitClientEvent) return;
    const clientId = this._clientIdRef ? this._clientIdRef.current : '';
    try {
      this._emitClientEvent({
        requestId: this._sessionId || `offline_${Date.now()}`,
        clientId,
        kind: 'offline',
        name,
        fields: fields && typeof fields === 'object' ? fields : {},
      });
    } catch (_) {
      // ignore
    }
  }
}
