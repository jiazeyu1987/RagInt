import { renderHook } from '../testUtils/renderHook';
import { useClientId } from './useClientId';

describe('useClientId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns existing client id from localStorage', () => {
    localStorage.setItem('clientId', 'cid_existing');
    const hook = renderHook(() => useClientId(), {});

    expect(hook.result()).toBe('cid_existing');
    hook.unmount();
  });

  test('creates and stores new client id when missing', () => {
    const originalCrypto = global.crypto;
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        randomUUID: jest.fn(() => 'uuid_test_1'),
      },
    });

    const hook = renderHook(() => useClientId(), {});

    expect(hook.result()).toBe('uuid_test_1');
    expect(localStorage.getItem('clientId')).toBe('uuid_test_1');
    hook.unmount();

    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  test('falls back when localStorage access throws', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage_error');
    });

    const hook = renderHook(() => useClientId(), {});
    expect(hook.result()).toMatch(/^cid_/);
    hook.unmount();

    getItemSpy.mockRestore();
  });
});

