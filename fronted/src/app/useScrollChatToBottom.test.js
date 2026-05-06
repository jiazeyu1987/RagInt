import { renderHook } from '../testUtils/renderHook';
import { useScrollChatToBottom } from './useScrollChatToBottom';

describe('useScrollChatToBottom', () => {
  test('scrolls the chat sentinel when chat output changes', async () => {
    const scrollIntoView = jest.fn();
    const messagesEndRef = { current: { scrollIntoView } };
    const hook = renderHook((props) => useScrollChatToBottom(props), {
      messagesEndRef,
      lastQuestion: 'q1',
      answer: 'a1',
      isLoading: false,
      queueStatus: '',
    });

    await hook.flush();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' });

    hook.rerender({ messagesEndRef, lastQuestion: 'q1', answer: 'a2', isLoading: false, queueStatus: '' });
    await hook.flush();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  test('does nothing when the sentinel is not mounted', async () => {
    const messagesEndRef = { current: null };
    const hook = renderHook((props) => useScrollChatToBottom(props), {
      messagesEndRef,
      lastQuestion: '',
      answer: '',
      isLoading: false,
      queueStatus: '',
    });

    await hook.flush();
  });
});
