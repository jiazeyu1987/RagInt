import React from 'react';

export function StagePanel({
  onPause,
  onContinue,
  onRestart,
  onSkip,
  onToggleSpeed,
  speedLabel,
  disabled,
} = {}) {
  return (
    <div className="settings-section">
      <div className="settings-title" style={{ fontWeight: 600, marginBottom: 8 }}>
        控场面板
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!!disabled} onClick={() => onPause && onPause()}>
          暂停
        </button>
        <button type="button" disabled={!!disabled} onClick={() => onContinue && onContinue()}>
          继续
        </button>
        <button type="button" disabled={!!disabled} onClick={() => onSkip && onSkip()}>
          跳过
        </button>
        <button type="button" disabled={!!disabled} onClick={() => onRestart && onRestart()}>
          重来
        </button>
        <button type="button" disabled={!!disabled} onClick={() => onToggleSpeed && onToggleSpeed()}>
          加速：{speedLabel || '标准'}
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
        提示：加速会把讲解“目标时长”切到 30 秒（影响后续生成与预取）；暂停/继续用于打断与续讲。
      </div>
    </div>
  );
}

