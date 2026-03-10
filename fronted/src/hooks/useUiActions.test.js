import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useUiActions } from './useUiActions';

describe('useUiActions', () => {
  test('handles history pick, quick summary and sort handler', async () => {
    jest.useFakeTimers();
    const focus = jest.fn();
    const inputElRef = { current: { focus } };
    const setInputText = jest.fn();
    const submitTextAuto = jest.fn().mockResolvedValue(undefined);
    const setHistorySort = jest.fn();

    const hook = renderHook((p) => useUiActions(p), {
      inputElRef,
      setInputText,
      submitTextAuto,
      setHistorySort,
    });

    act(() => {
      hook.result().onPickHistoryQuestion('history q');
    });
    expect(setInputText).toHaveBeenCalledWith('history q');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(focus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result().onQuickSummary();
    });
    expect(submitTextAuto).toHaveBeenCalledWith(expect.stringContaining('30'), 'settings_quick');
    expect(hook.result().onChangeHistorySort).toBe(setHistorySort);

    hook.unmount();
    jest.useRealTimers();
  });
});
