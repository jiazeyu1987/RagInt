import { useCallback, useState } from 'react';
import {
  buildRagflowConnectionStatus,
  buildRagflowUnavailableUpdate,
  shouldMarkRagflowAvailable,
} from './appShellRagflowModel';

export function useRagflowConnectionState() {
  const [ragflowConnection, setRagflowConnection] = useState({ connected: null, message: '' });
  const [ragflowQueueStatus, setRagflowQueueStatus] = useState('');
  const {
    unavailable: ragflowUnavailable,
    label: ragflowStatusLabel,
    tone: ragflowStatusTone,
  } = buildRagflowConnectionStatus(ragflowConnection);

  const markRagflowAvailable = useCallback((info) => {
    if (!shouldMarkRagflowAvailable(info)) return;
    setRagflowConnection((prev) => (prev && prev.connected === true ? prev : { connected: true, message: '' }));
    setRagflowQueueStatus('');
  }, []);

  const markRagflowUnavailable = useCallback((info) => {
    const { connection, queueStatus } = buildRagflowUnavailableUpdate(info);
    setRagflowConnection(connection);
    setRagflowQueueStatus(queueStatus);
  }, []);

  return {
    ragflowConnection,
    ragflowQueueStatus,
    ragflowUnavailable,
    ragflowStatusLabel,
    ragflowStatusTone,
    markRagflowAvailable,
    markRagflowUnavailable,
  };
}
