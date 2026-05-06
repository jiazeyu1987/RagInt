import { renderHook } from '../testUtils/renderHook';
import { useAppShellTourHelpers } from './useAppShellTourHelpers';

describe('useAppShellTourHelpers', () => {
  test('reads a normalized tour stop name within bounds', () => {
    const hook = renderHook((props) => useAppShellTourHelpers(props), {
      tourStops: ['  A  ', 'B', 'C'],
      getTourPipeline: jest.fn(),
    });

    expect(hook.result().getTourStopName(0)).toBe('A');
    expect(hook.result().getTourStopName(99)).toBe('C');
    expect(hook.result().getTourStopName(-1)).toBe('A');
  });

  test('returns an empty stop name when tour stops are missing', () => {
    const hook = renderHook((props) => useAppShellTourHelpers(props), {
      tourStops: null,
      getTourPipeline: jest.fn(),
    });

    expect(hook.result().getTourStopName(0)).toBe('');
  });

  test('delegates tour prompt building to the current tour pipeline', () => {
    const buildTourPrompt = jest.fn(() => 'prompt');
    const getTourPipeline = jest.fn(() => ({ buildTourPrompt }));
    const hook = renderHook((props) => useAppShellTourHelpers(props), {
      tourStops: [],
      getTourPipeline,
    });

    expect(hook.result().buildTourPrompt('next', 2, 'tail')).toBe('prompt');
    expect(buildTourPrompt).toHaveBeenCalledWith('next', 2, 'tail');
  });

  test('returns a numeric timestamp', () => {
    const hook = renderHook((props) => useAppShellTourHelpers(props), {
      tourStops: [],
      getTourPipeline: jest.fn(),
    });

    expect(Number.isFinite(hook.result().nowMs())).toBe(true);
  });
});
