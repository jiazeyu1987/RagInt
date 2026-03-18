import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QaAudioCachePanel } from './QaAudioCachePanel';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
  backendUrl: (path) => `http://unit.test${path}`,
}));

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('QaAudioCachePanel', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    window.localStorage.clear();
  });

  test('loads list and deletes item', async () => {
    fetchJson.mockImplementation((url, opts) => {
      if (String(url).includes('/api/ops/qa_audio_pairs?')) {
        return Promise.resolve({
          items: [{ id: 1, question_text: 'q1', answer_text: 'a1', audio_url: '/a.wav', tts_speed: 1.0 }],
        });
      }
      if (String(url).includes('/api/ops/qa_audio_pairs/1') && opts && opts.method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ items: [] });
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    const view = render(<QaAudioCachePanel />);
    await flush();

    expect(view.container.textContent).toContain('q1');
    expect(view.container.querySelector('audio')).toBeTruthy();

    const actionButtons = view.container.querySelectorAll('button.settings-action-btn');
    const deleteBtn = actionButtons[actionButtons.length - 1];
    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flush();

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/ops/qa_audio_pairs/1',
      expect.objectContaining({ method: 'DELETE' })
    );
    confirmSpy.mockRestore();
    view.unmount();
  });

  test('sends X-Ops-Token header when token exists in localStorage', async () => {
    window.localStorage.setItem('ragint_ops_token', 'tok-1');
    fetchJson.mockResolvedValue({ items: [] });

    render(<QaAudioCachePanel />);
    await flush();

    const firstCall = fetchJson.mock.calls[0] || [];
    expect(String(firstCall[0] || '')).toContain('/api/ops/qa_audio_pairs?');
    expect(firstCall[1]).toEqual(expect.objectContaining({ headers: { 'X-Ops-Token': 'tok-1' } }));
  });
});
