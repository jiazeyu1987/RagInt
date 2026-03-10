import { fetchJson } from './backendClient';
import { sendTourControl } from './tourControl';

jest.mock('./backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('sendTourControl', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('returns action_required when action is missing', async () => {
    const result = await sendTourControl({ clientId: 'x' });
    expect(result).toEqual({ ok: false, error: 'action_required' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test('posts action and payload to tour control endpoint', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });

    const result = await sendTourControl({
      clientId: ' client-x ',
      action: 'next',
      payload: { stopIndex: 2 },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchJson).toHaveBeenCalledWith('/api/tour/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': 'client-x',
      },
      body: JSON.stringify({
        action: 'next',
        payload: { stopIndex: 2 },
      }),
    });
  });

  test('normalizes invalid payload as empty object', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });

    await sendTourControl({
      clientId: '',
      action: 'pause',
      payload: 'bad_payload',
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/tour/control', expect.objectContaining({
      body: JSON.stringify({
        action: 'pause',
        payload: {},
      }),
    }));
  });
});

