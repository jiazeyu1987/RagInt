import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HistoryPanel } from './HistoryPanel';

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

describe('HistoryPanel', () => {
  test('renders items and dispatches sort/pick callbacks', () => {
    const onChangeSort = jest.fn();
    const onPickQuestion = jest.fn();
    const view = render(
      <HistoryPanel
        embedded
        historySort="time"
        onChangeSort={onChangeSort}
        onPickQuestion={onPickQuestion}
        items={[{ id: 1, question: 'q1', cnt: 2 }, { id: 2, question: '' }]}
      />
    );

    const select = view.container.querySelector('select');
    select.value = 'count';
    act(() => {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChangeSort).toHaveBeenCalledWith('count');

    const itemBtn = view.container.querySelector('.history-item');
    act(() => {
      itemBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPickQuestion).toHaveBeenCalledWith('q1');

    view.unmount();
  });
});

