import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

export function renderHook(hookFactory, initialProps) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const propsRef = { current: initialProps };
  let value;

  function TestHarness() {
    value = hookFactory(propsRef.current);
    return null;
  }

  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(TestHarness));
  });

  const rerender = (nextProps) => {
    propsRef.current = nextProps;
    act(() => {
      root.render(React.createElement(TestHarness));
    });
  };

  const updateProps = (partialProps) => {
    const base = propsRef.current && typeof propsRef.current === 'object' ? propsRef.current : {};
    propsRef.current = { ...base, ...(partialProps || {}) };
    act(() => {
      root.render(React.createElement(TestHarness));
    });
  };

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  const unmount = () => {
    act(() => {
      root.unmount();
    });
  };

  return {
    result: () => value,
    rerender,
    updateProps,
    flush,
    unmount,
  };
}
