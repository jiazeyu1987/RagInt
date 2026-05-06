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

  test('throws when storage read fails instead of returning default value', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read_failed');
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const defaultFactory = jest.fn(() => 'safe');

    expect(() =>
      renderHook((props) => useLocalStorageState(props.key, props.defaultValue, props.options), {
        key: 'k1',
        defaultValue: defaultFactory,
      })
    ).toThrow('read_failed');

    expect(getItemSpy).toHaveBeenCalledWith('k1');
    expect(defaultFactory).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('throws when stored value cannot be deserialized instead of returning default value', () => {
    localStorage.setItem('prefs', '{bad json');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const defaultFactory = jest.fn(() => ({ name: 'safe' }));

    expect(() =>
      renderHook((props) => useLocalStorageState(props.key, props.defaultValue, props.options), {
        key: 'prefs',
        defaultValue: defaultFactory,
        options: {
          deserialize: (raw) => JSON.parse(raw),
          serialize: (v) => JSON.stringify(v),
        },
      })
    ).toThrow();

    expect(defaultFactory).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('throws when storage write fails instead of silently keeping in-memory success', () => {
    localStorage.setItem('prefs', 'initial');
    const hook = renderHook((props) => useLocalStorageState(props.key, props.defaultValue, props.options), {
      key: 'prefs',
      defaultValue: 'safe',
    });
    const setItemError = new Error('write_failed');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw setItemError;
    });

    expect(() => {
      act(() => {
        hook.result()[1]('next');
      });
    }).toThrow(setItemError);

    consoleErrorSpy.mockRestore();
    hook.unmount();
  });
});

