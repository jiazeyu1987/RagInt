import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useLocalStorageState } from './useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('returns default value for empty key and does not write storage', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const hook = renderHook(
      (props) => useLocalStorageState(props.key, props.defaultValue, props.options),
      {
        key: '   ',
        defaultValue: 'fallback',
      }
    );

    expect(hook.result()[0]).toBe('fallback');

    act(() => {
      hook.result()[1]('next');
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('reads from storage, deserializes, and writes serialized updates', () => {
    localStorage.setItem('prefs', '{"name":"alice"}');
    const hook = renderHook(
      (props) => useLocalStorageState(props.key, props.defaultValue, props.options),
      {
        key: 'prefs',
        defaultValue: { name: 'default' },
        options: {
          deserialize: (raw) => JSON.parse(raw),
          serialize: (v) => JSON.stringify(v),
        },
      }
    );

    expect(hook.result()[0]).toEqual({ name: 'alice' });

    act(() => {
      hook.result()[1]({ name: 'bob' });
    });

    expect(localStorage.getItem('prefs')).toBe('{"name":"bob"}');
    hook.unmount();
  });

  test('falls back to default when storage read throws', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read_failed');
    });
    const defaultFactory = jest.fn(() => 'safe');

    const hook = renderHook(
      (props) => useLocalStorageState(props.key, props.defaultValue, props.options),
      {
        key: 'k1',
        defaultValue: defaultFactory,
      }
    );

    expect(getItemSpy).toHaveBeenCalledWith('k1');
    expect(defaultFactory).toHaveBeenCalledTimes(1);
    expect(hook.result()[0]).toBe('safe');
    hook.unmount();
  });
});

