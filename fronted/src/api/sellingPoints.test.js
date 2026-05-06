import { fetchJson } from './backendClient';
import { deleteSellingPoint, listSellingPoints, upsertSellingPoint } from './sellingPoints';

jest.mock('./backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('sellingPoints api wrappers', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('listSellingPoints reports missing stop name instead of empty success', async () => {
    await expect(listSellingPoints({ stopName: ' ' })).resolves.toEqual({
      ok: false,
      error: 'stop_name_required',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test('listSellingPoints queries endpoint with encoded params', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true, items: [] });
    await listSellingPoints({ stopName: 'A B', limit: 20 });
    expect(fetchJson).toHaveBeenCalledWith('/api/selling_points?stop_name=A%20B&limit=20');
  });

  test('listSellingPoints rejects invalid limit before request', async () => {
    await expect(listSellingPoints({ stopName: 'A', limit: 'many' })).resolves.toEqual({
      ok: false,
      error: 'limit_invalid',
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test('upsertSellingPoint sends valid payload', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });
    await upsertSellingPoint({
      stopName: ' Stop-1 ',
      text: ' Selling point ',
      weight: '3.5',
      tags: ['tag-a'],
    });

    expect(fetchJson).toHaveBeenCalledWith('/api/selling_points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stop_name: 'Stop-1',
        text: 'Selling point',
        weight: 3.5,
        tags: ['tag-a'],
      }),
    });
  });

  test('upsertSellingPoint rejects invalid weight and tags before request', async () => {
    await expect(upsertSellingPoint({ stopName: 'S', text: 'T', weight: 'heavy' })).resolves.toEqual({
      ok: false,
      error: 'weight_invalid',
    });
    await expect(upsertSellingPoint({ stopName: 'S', text: 'T', tags: 'bad_tags' })).resolves.toEqual({
      ok: false,
      error: 'tags_list_required',
    });
    expect(fetchJson).not.toHaveBeenCalled();
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

