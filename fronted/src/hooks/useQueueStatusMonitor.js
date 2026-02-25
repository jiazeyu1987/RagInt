import { useCallback } from 'react';

export function useQueueStatusMonitor({ ttsManagerRef, requestSeqRef, getIsLoading, setQueueStatus } = {}) {
  const updateQueueStatus = useCallback(() => {
    const mgr = ttsManagerRef && ttsManagerRef.current ? ttsManagerRef.current : null;
    const stats = mgr ? mgr.getStats() : { textCount: 0, audioCount: 0, generatorRunning: false, playerRunning: false };
    const textCount = stats.textCount || 0;
    const audioCount = stats.audioCount || 0;
    const generatorRunning = !!stats.generatorRunning;
    const playerRunning = !!stats.playerRunning;

    setQueueStatus(
      `📝待生成: ${textCount} | 🔊预生成: ${audioCount} | ` +
        `${generatorRunning ? '🎵生成中' : '⏸️生成空闲'} | ` +
        `${playerRunning ? '🔊播放中' : '⏸️播放空闲'}`
    );
  }, [ttsManagerRef, setQueueStatus]);

  const startStatusMonitor = useCallback(
    (runId) => {
      const interval = setInterval(() => {
        const mgr = ttsManagerRef && ttsManagerRef.current ? ttsManagerRef.current : null;
        const busy = mgr ? mgr.isBusy() : false;
        const isLoading = typeof getIsLoading === 'function' ? !!getIsLoading() : false;
        const currentRunId = requestSeqRef && requestSeqRef.current != null ? requestSeqRef.current : 0;
        if (currentRunId === runId && (isLoading || busy)) {
          updateQueueStatus();
        } else {
          setQueueStatus('');
          clearInterval(interval);
        }
      }, 200);
    },
    [getIsLoading, requestSeqRef, setQueueStatus, ttsManagerRef, updateQueueStatus]
  );

  return { startStatusMonitor };
}
