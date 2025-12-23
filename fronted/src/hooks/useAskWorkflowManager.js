import { useCallback, useRef } from 'react';
import { AskWorkflowManager } from '../managers/AskWorkflowManager';

export function useAskWorkflowManager(deps) {
  const askWorkflowRef = useRef(null);

  const getAskWorkflow = useCallback(() => {
    if (!askWorkflowRef.current) {
      askWorkflowRef.current = new AskWorkflowManager(deps || {});
    } else {
      askWorkflowRef.current.setDeps(deps || {});
    }
    return askWorkflowRef.current;
  }, [deps]);

  const interruptCurrentRun = useCallback(
    (reason) => {
      getAskWorkflow().interrupt(reason);
    },
    [getAskWorkflow]
  );

  const askQuestion = useCallback(
    async (text, opts) => {
      return getAskWorkflow().ask(text, opts);
    },
    [getAskWorkflow]
  );

  return { getAskWorkflow, interruptCurrentRun, askQuestion };
}

