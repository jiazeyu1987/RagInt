import { renderHook } from '../testUtils/renderHook';
import { useClearExhibitChatSessions } from './useClearExhibitChatSessions';

describe('useClearExhibitChatSessions', () => {
  test('does not clear sessions when the user cancels confirmation', async () => {
    const manager = { clearSessions: jest.fn() };
    const confirm = jest.fn(() => false);
    const alert = jest.fn();
    const hook = renderHook((props) => useClearExhibitChatSessions(props), { manager, confirm, alert });

    await hook.result().clearExhibitChatSessions();

    expect(confirm).toHaveBeenCalledWith('确认删除“展厅聊天”的所有 session 吗？');
    expect(manager.clearSessions).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  test('clears exhibit chat sessions and reports the deleted count', async () => {
    const manager = { clearSessions: jest.fn().mockResolvedValue({ deleted: 3 }) };
    const confirm = jest.fn(() => true);
    const alert = jest.fn();
    const hook = renderHook((props) => useClearExhibitChatSessions(props), { manager, confirm, alert });

    await hook.result().clearExhibitChatSessions();

    expect(manager.clearSessions).toHaveBeenCalledWith('展厅聊天');
    expect(alert).toHaveBeenCalledWith('3 个 session 已删除');
  });

  test('reports clear errors directly', async () => {
    const manager = { clearSessions: jest.fn().mockRejectedValue(new Error('clear failed')) };
    const confirm = jest.fn(() => true);
    const alert = jest.fn();
    const hook = renderHook((props) => useClearExhibitChatSessions(props), { manager, confirm, alert });

    await hook.result().clearExhibitChatSessions();

    expect(alert).toHaveBeenCalledWith('clear failed');
  });
});
