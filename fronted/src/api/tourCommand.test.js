import { fetchJson } from './backendClient';
import { parseTourCommand } from './tourCommand';

jest.mock('./backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('parseTourCommand', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('posts command parse payload with client id header', async () => {
    fetchJson.mockResolvedValueOnce({ intent: 'tour_command', action: 'next' });

    const result = await parseTourCommand({
      clientId: ' client-1 ',
      text: 'next stop',
      stops: ['A', 'B'],
    });

    expect(result).toEqual({ intent: 'tour_command', action: 'next' });
    expect(fetchJson).toHaveBeenCalledWith('/api/tour/command/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': 'client-1',
      },
      body: JSON.stringify({
        text: 'next stop',
        stops: ['A', 'B'],
      }),
    });
  });

  test('rejects missing text and invalid stops before request', async () => {
    await expect(parseTourCommand()).resolves.toEqual({ ok: false, error: 'text_required' });
    await expect(parseTourCommand({ text: 'next', stops: 'bad' })).resolves.toEqual({
      ok: false,
      error: 'stops_list_required',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

