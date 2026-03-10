import { act } from 'react';
import { fetchJson } from '../api/backendClient';
import { renderHook } from '../testUtils/renderHook';
import { useHistoryPanel } from './useHistoryPanel';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useHistoryPanel', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('does not auto-fetch when disabled', () => {
    const hook = renderHook((props) => useHistoryPanel(props), { enabled: false });
    expect(hook.result().historySort).toBe('time');
    expect(hook.result().historyItems).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('auto-fetches history when enabled and updates items', async () => {
    fetchJson.mockResolvedValueOnce({ items: [{ question: 'q1' }] });
    const hook = renderHook((props) => useHistoryPanel(props), { enabled: true });

    await hook.flush();

    expect(fetchJson).toHaveBeenCalledWith('/api/history?sort=time&limit=200');
    expect(hook.result().historyItems).toEqual([{ question: 'q1' }]);
    hook.unmount();
  });

  test('setHistorySort triggers fetch with next sort mode', async () => {
    fetchJson.mockResolvedValueOnce({ items: [] });
    fetchJson.mockResolvedValueOnce({ items: [{ question: 'q_count' }] });
    const hook = renderHook((props) => useHistoryPanel(props), { enabled: true });

    await hook.flush();
    act(() => {
      hook.result().setHistorySort('count');
    });
    await hook.flush();

    expect(fetchJson).toHaveBeenNthCalledWith(2, '/api/history?sort=count&limit=200');
    expect(hook.result().historyItems).toEqual([{ question: 'q_count' }]);
    hook.unmount();
  });

  test('fetchHistory handles request error by resetting to empty list', async () => {
    fetchJson.mockRejectedValueOnce(new Error('history_failed'));
    const hook = renderHook((props) => useHistoryPanel(props), { enabled: true });

    await hook.flush();

    expect(hook.result().historyItems).toEqual([]);
    hook.unmount();
  });
});
