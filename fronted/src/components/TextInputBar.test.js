import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TextInputBar } from './TextInputBar';

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe('TextInputBar', () => {
  test('renders form and forwards submit event', () => {
    const onSubmit = jest.fn((e) => e.preventDefault());
    const view = render(
      <TextInputBar onSubmit={onSubmit}>
        <button type="submit">send</button>
      </TextInputBar>
    );

    const form = view.container.querySelector('form.text-input-minimal');
    expect(form).not.toBeNull();

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
