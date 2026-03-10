import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useAskWorkflowManager } from './useAskWorkflowManager';

let mockInstances = [];

jest.mock('../managers/AskWorkflowManager', () => ({
  AskWorkflowManager: function AskWorkflowManagerMock(deps) {
    this.deps = deps;
    this.setDeps = jest.fn();
    this.interrupt = jest.fn();
    this.ask = jest.fn().mockResolvedValue('ok');
    mockInstances.push(this);
  },
}));

describe('useAskWorkflowManager', () => {
  beforeEach(() => {
    mockInstances = [];
  });

  test('creates manager once and forwards ask/interrupt/setDeps', async () => {
    const hook = renderHook((p) => useAskWorkflowManager(p), { name: 'd1' });
    expect(mockInstances).toHaveLength(0);

    await act(async () => {
      const result = await hook.result().askQuestion('hello', { from: 'test' });
      expect(result).toBe('ok');
    });
    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].ask).toHaveBeenCalledWith('hello', { from: 'test' });

    act(() => {
      hook.result().interruptCurrentRun('manual');
    });
    expect(mockInstances[0].interrupt).toHaveBeenCalledWith('manual');

    hook.rerender({ name: 'd2' });
    act(() => {
      hook.result().getAskWorkflow();
    });
    expect(mockInstances[0].setDeps).toHaveBeenCalledWith({ name: 'd2' });

    hook.unmount();
  });
});

