function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

export class RagflowChunkManager {
  constructor({ fetchImpl, textDecoderFactory } = {}) {
    this._fetch = typeof fetchImpl === 'function' ? fetchImpl : (...args) => fetch(...args);
    this._createDecoder = typeof textDecoderFactory === 'function' ? textDecoderFactory : () => new TextDecoder();
  }

  buildAskRequest({ baseUrl = '', requestId = '', clientId = '', recordingId = '', payload, signal } = {}) {
    const rid = safeTrim(recordingId);
    return {
      url: `${safeTrim(baseUrl)}/api/ask`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': safeTrim(clientId),
          'X-Request-ID': safeTrim(requestId),
          ...(rid ? { 'X-Recording-ID': rid } : {}),
        },
        body: JSON.stringify(payload || {}),
        signal,
      },
    };
  }

  async fetchAskStream(args = {}) {
    const { url, init } = this.buildAskRequest(args);
    return this._fetch(url, init);
  }

  async readSseStream(response, handlers = {}) {
    if (!response || !response.body || typeof response.body.getReader !== 'function') {
      throw new Error('ragflow_stream_body_missing');
    }
    const reader = response.body.getReader();
    const decoder = this._createDecoder();
    let sseBuffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = safeTrim(line);
        if (!trimmed.startsWith('data: ')) continue;
        let data = null;
        try {
          data = JSON.parse(trimmed.slice(6));
        } catch (_) {
          continue;
        }
        if (typeof handlers.onEvent === 'function') {
          const shouldStop = await handlers.onEvent(data);
          if (shouldStop === false) return;
        }
        if (data && data.chunk && !data.done && typeof handlers.onChunk === 'function') {
          await handlers.onChunk(String(data.chunk || ''), data);
        }
        if (data && data.segment && !data.done && typeof handlers.onSegment === 'function') {
          await handlers.onSegment(String(data.segment || ''), data);
        }
        if (data && data.done && typeof handlers.onDone === 'function') {
          await handlers.onDone(data);
        }
        if (data && data.done) return;
      }
    }
  }
}

export const ragflowChunkManager = new RagflowChunkManager();
