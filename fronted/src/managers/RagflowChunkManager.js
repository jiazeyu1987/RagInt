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
    const handleLine = async (line) => {
      const trimmed = safeTrim(line);
      if (!trimmed) return false;
      if (!trimmed.startsWith('data: ')) return false;
      let data = null;
      try {
        data = JSON.parse(trimmed.slice(6));
      } catch (_) {
        throw new Error('ragflow_sse_event_invalid_json');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('ragflow_sse_event_invalid_payload');
      }
      if (typeof handlers.onEvent === 'function') {
        const shouldStop = await handlers.onEvent(data);
        if (shouldStop === false) return true;
      }
      if (data.chunk && !data.done && typeof handlers.onChunk === 'function') {
        await handlers.onChunk(String(data.chunk || ''), data);
      }
      if (data.segment && !data.done && typeof handlers.onSegment === 'function') {
        await handlers.onSegment(String(data.segment || ''), data);
      }
      if (data.done && typeof handlers.onDone === 'function') {
        await handlers.onDone(data);
      }
      return !!data.done;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';
      for (const line of lines) {
        if (await handleLine(line)) return;
      }
    }
    if (safeTrim(sseBuffer) && await handleLine(sseBuffer)) return;
  }
}

export const ragflowChunkManager = new RagflowChunkManager();
