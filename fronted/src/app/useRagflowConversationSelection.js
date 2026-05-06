import { useCallback, useEffect } from 'react';
import {
  buildRagflowConversationLabel,
  resolveCurrentRagflowConversationName as resolveCurrentRagflowConversationNameValue,
  resolveTourRagflowConversationName as resolveTourRagflowConversationNameValue,
} from './appShellRagflowModel';

export function useRagflowConversationSelection({
  ragflowUnavailable = false,
  useAgentMode = false,
  selectedChatRef = null,
  selectedChat = '',
  chatOptions = [],
  setSelectedChat,
  isLoading = false,
  activeRagflowConversationName = '',
  setActiveRagflowConversationName,
} = {}) {
  const resolveCurrentRagflowConversationName = useCallback(() => {
    return resolveCurrentRagflowConversationNameValue({
      ragflowUnavailable,
      useAgentMode,
      selectedChatRef,
      selectedChat,
    });
  }, [ragflowUnavailable, selectedChat, selectedChatRef, useAgentMode]);

  const resolveTourRagflowConversationName = useCallback(() => {
    const currentName = resolveCurrentRagflowConversationName();
    return resolveTourRagflowConversationNameValue({ currentName, chatOptions });
  }, [chatOptions, resolveCurrentRagflowConversationName]);

  const prepareTourRagflowConversation = useCallback(() => {
    const nextName = resolveTourRagflowConversationName();
    if (!nextName) return '';
    if (selectedChatRef) selectedChatRef.current = nextName;
    setSelectedChat(nextName);
    return nextName;
  }, [resolveTourRagflowConversationName, selectedChatRef, setSelectedChat]);

  useEffect(() => {
    if (ragflowUnavailable || useAgentMode) {
      setActiveRagflowConversationName('');
    }
  }, [ragflowUnavailable, useAgentMode, setActiveRagflowConversationName]);

  const rawSelectedChatName = String((selectedChatRef && selectedChatRef.current) || selectedChat || '').trim();
  const currentRagflowConversationName = String(resolveCurrentRagflowConversationName() || '').trim();
  const ragflowConversationLabel = buildRagflowConversationLabel({
    useAgentMode,
    isLoading,
    activeRagflowConversationName,
    currentRagflowConversationName,
    rawSelectedChatName,
  });

  return {
    currentRagflowConversationName,
    prepareTourRagflowConversation,
    ragflowConversationLabel,
    rawSelectedChatName,
    resolveCurrentRagflowConversationName,
    resolveTourRagflowConversationName,
  };
}
