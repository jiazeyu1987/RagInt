import { RagflowChunkManager } from './RagflowChunkManager';

describe('RagflowChunkManager', () => {
  test('builds ask request headers and body', () => {
    const manager = new RagflowChunkManager({ fetchImpl: jest.fn() });
    const req = manager.buildAskRequest({
      baseUrl: 'http://localhost',
      requestId: 'req-1',
      clientId: 'client-1',
      recordingId: 'rec-1',
      payload: { question: 'hello' },
    });

    expect(req.url).toBe('http://localhost/api/ask');
    expect(req.init.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Client-ID': 'client-1',
        'X-Request-ID': 'req-1',
        'X-Recording-ID': 'rec-1',
      })
    );
    expect(req.init.body).toBe(JSON.stringify({ question: 'hello' }));
  });

  test('streams chunk, segment and done events from SSE response', async () => {
    global.TextDecoder = class {
      decode(value) {
        return typeof value === 'string' ? value : '';
      }
    };
    const events = [];
    const manager = new RagflowChunkManager({ fetchImpl: jest.fn() });
    const frames = [
      'data: {"chunk":"第一句"}\n',
      'data: {"segment":"第一段"}\n',
      'data: {"done":true}\n',
      '\n',
    ];
    let index = 0;
    const response = {
      body: {
        getReader() {
          return {
            async read() {
              if (index >= frames.length) return { done: true, value: undefined };
              return { done: false, value: frames[index++] };
            },
          };
        },
      },
    };

    await manager.readSseStream(response, {
      onEvent: async (data) => {
        events.push(['event', data]);
        return true;
      },
      onChunk: async (chunk) => events.push(['chunk', chunk]),
      onSegment: async (segment) => events.push(['segment', segment]),
      onDone: async () => events.push(['done']),
    });

    expect(events).toEqual([
      ['event', { chunk: '第一句' }],
      ['chunk', '第一句'],
      ['event', { segment: '第一段' }],
      ['segment', '第一段'],
      ['event', { done: true }],
      ['done'],
    ]);
  });
});
