import { fetchJson } from './backendClient';
import { deleteSellingPoint, listSellingPoints, upsertSellingPoint } from './sellingPoints';

jest.mock('./backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('sellingPoints api wrappers', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('listSellingPoints returns empty result immediately when stop name is empty', async () => {
    await expect(listSellingPoints({ stopName: ' ' })).resolves.toEqual({
      ok: true,
      stop_name: '',
      items: [],
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test('listSellingPoints queries endpoint with encoded params', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true, items: [] });
    await listSellingPoints({ stopName: 'A B', limit: 20 });
    expect(fetchJson).toHaveBeenCalledWith('/api/selling_points?stop_name=A%20B&limit=20');
  });

  test('upsertSellingPoint normalizes payload', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    await upsertSellingPoint({
      stopName: ' Stop-1 ',
      text: ' Selling point ',
      weight: '3.5',
      tags: 'bad_tags',
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/selling_points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stop_name: 'Stop-1',
        text: 'Selling point',
        weight: 3.5,
        tags: [],
      }),
    });
  });

  test('deleteSellingPoint sends delete request with encoded query', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    await deleteSellingPoint({
      stopName: 'Stop A',
      text: 'A&B',
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/selling_points?stop_name=Stop%20A&text=A%26B', {
      method: 'DELETE',
    });
  });
});

