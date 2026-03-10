import { renderHook } from '../testUtils/renderHook';
import { useTourState } from './useTourState';
import { useLocalStorageState } from './useLocalStorageState';

jest.mock('./useLocalStorageState', () => ({
  useLocalStorageState: jest.fn(),
}));

describe('useTourState', () => {
  beforeEach(() => {
    useLocalStorageState.mockReset();
    useLocalStorageState.mockReturnValue([{ mode: 'idle', stopIndex: -1, stopName: '', lastAnswerTail: '', lastAction: null }, jest.fn()]);
  });

  test('delegates to localStorage hook with normalized serializer', () => {
    const hook = renderHook(() => useTourState('tour-key'));
    expect(hook.result()[0]).toEqual(expect.objectContaining({ mode: 'idle' }));
    expect(useLocalStorageState).toHaveBeenCalledTimes(1);

    const args = useLocalStorageState.mock.calls[0];
    expect(args[0]).toBe('tour-key');
    expect(args[1]).toEqual(expect.objectContaining({ mode: 'idle', stopIndex: -1 }));
    expect(typeof args[2].serialize).toBe('function');
    expect(typeof args[2].deserialize).toBe('function');

    const serialized = args[2].serialize({ mode: 'running', stopIndex: 3, stopName: 'A' });
    expect(typeof serialized).toBe('string');
    expect(args[2].deserialize('{bad-json}')).toEqual(
      expect.objectContaining({ mode: 'idle', stopIndex: -1, stopName: '' })
    );

    hook.unmount();
  });
});

