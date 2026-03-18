import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RecordingArchivePreviewPanel } from './RecordingArchivePreviewPanel';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
  backendUrl: (path) => {
    const p = String(path || '');
    return p.startsWith('/') ? `http://backend.test${p}` : `http://backend.test/${p}`;
  },
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

describe('RecordingArchivePreviewPanel', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('shows placeholder when no recording id', () => {
    const view = render(<RecordingArchivePreviewPanel />);
    expect(view.container.textContent).toContain('请选择');
    view.unmount();
  });

  test('loads stop segments and regenerates one segment', async () => {
    fetchJson.mockImplementation((url, opts) => {
      if (url === '/api/recordings/rec-1') return Promise.resolve({ stops: ['Stop A'] });
      if (url === '/api/recordings/rec-1/stop/0') {
        return Promise.resolve({
          stop_index: 0,
          stop_name: 'Stop A',
          answer_text: 'Answer A',
          segments: [{ segment_id: 11, segment_index: 0, text: 'old text', audio_url: '/old.wav' }],
        });
      }
      if (String(url).includes('/segment/11/regenerate') && opts && opts.method === 'POST') {
        return Promise.resolve({ segment: { segment_id: 11, text: 'new text', audio_url: '/new.wav' } });
      }
      return Promise.resolve({});
    });

    const view = render(
      <RecordingArchivePreviewPanel recordingId="rec-1" ttsProvider="modelscope" ttsVoice="voice-1" ttsSpeed={1.25} />
    );
    await flush();

    expect(view.container.textContent).toContain('Answer A');
    const actionButtons = view.container.querySelectorAll('button.settings-action-btn');
    const regenerateButton = actionButtons[actionButtons.length - 1];
    await act(async () => {
      regenerateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flush();

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/recordings/rec-1/segment/11/regenerate',
      expect.objectContaining({ method: 'POST' })
    );
    expect(view.container.textContent).toContain('new text');
    view.unmount();
  });
});
