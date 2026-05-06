import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useRagflowConnectionState } from './useRagflowConnectionState';

describe('useRagflowConnectionState', () => {
  test('marks availability and ignores non-chat bootstrap success', () => {
    const hook = renderHook(() => useRagflowConnectionState());

    expect(hook.result().ragflowConnection).toEqual({ connected: null, message: '' });
    expect(hook.result().ragflowStatusLabel).toBe('检测中');

    act(() => hook.result().markRagflowAvailable({ source: 'bootstrap_agents' }));
    expect(hook.result().ragflowConnection).toEqual({ connected: null, message: '' });

    act(() => hook.result().markRagflowAvailable({ source: 'bootstrap_chats' }));
    expect(hook.result().ragflowConnection).toEqual({ connected: true, message: '' });
    expect(hook.result().ragflowStatusLabel).toBe('已连接');
    expect(hook.result().ragflowUnavailable).toBe(false);

    hook.unmount();
  });

  test('marks unavailable with status detail and queue text', () => {
    const hook = renderHook(() => useRagflowConnectionState());

    act(() => hook.result().markRagflowUnavailable({ source: 'tour_start', error: new Error('offline') }));

    expect(hook.result().ragflowUnavailable).toBe(true);
    expect(hook.result().ragflowStatusLabel).toBe('未连接');
    expect(hook.result().ragflowStatusTone).toBe('status-error');
    expect(hook.result().ragflowConnection.message).toContain('offline');
    expect(hook.result().ragflowQueueStatus).toBe('RAGFlow 未连接，已停止当前操作。');

    hook.unmount();
  });
});
