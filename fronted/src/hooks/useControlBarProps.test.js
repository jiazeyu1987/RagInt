import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useControlBarProps } from './useControlBarProps';

function buildProps(overrides = {}) {
  return {
    setTourRecordingEnabled: jest.fn(),
    setPlayTourRecordingEnabled: jest.fn(),
    setGuideDuration: jest.fn(),
    jumpTourStop: jest.fn().mockResolvedValue(undefined),
    tourSelectedStopIndex: 2,
    setTourStopDurationsOverride: jest.fn(),
    tourStopDurationsOverride: {},
    setTourStopPromptOverrides: jest.fn(),
    tourStopPromptOverrides: {},
    setTourStopDurationTemplateKey: jest.fn(),
    setTourStopDurationTemplates: jest.fn(),
    tourStopDurationTemplateKey: 'tpl_1m',
    tourStopDurationTemplates: {},
    tourStops: ['A', 'B'],
    tourStopDurations: [11, 22],
    resetTour: jest.fn(),
    ...overrides,
  };
}

describe('useControlBarProps', () => {
  test('normalizes key control handlers', async () => {
    const props = buildProps();
    const hook = renderHook((p) => useControlBarProps(p), props);
    const result = hook.result();

    act(() => {
      result.onChangeTourRecordingEnabled(true);
      result.onChangePlayTourRecordingEnabled(true);
      result.onChangeGuideDuration('x120s');
      result.onChangeTourStopDurationOverride('A', '35');
      result.onClearTourStopDurationsOverride();
    });
    await act(async () => {
      await result.onJump();
    });

    expect(props.setTourRecordingEnabled).toHaveBeenCalledWith(true);
    expect(props.setPlayTourRecordingEnabled).toHaveBeenCalledWith(false);
    expect(props.setPlayTourRecordingEnabled).toHaveBeenCalledWith(true);
    expect(props.setTourRecordingEnabled).toHaveBeenCalledWith(false);
    expect(props.setGuideDuration).toHaveBeenCalledWith('120');
    expect(props.setTourStopDurationsOverride).toHaveBeenCalledWith({ A: 35 });
    expect(props.setTourStopDurationsOverride).toHaveBeenCalledWith({});
    expect(props.jumpTourStop).toHaveBeenCalledWith(2);

    act(() => {
      result.onChangeTourStopDurationTemplate('tpl_2m');
    });
    expect(props.setTourStopDurationTemplateKey).toHaveBeenCalledWith('tpl_2m');
    expect(props.setTourStopDurationsOverride).toHaveBeenCalledWith({ A: 120, B: 120 });

    hook.unmount();
  });
});

