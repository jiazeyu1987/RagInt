import React from 'react';

export function SettingsToggles({
  showHistoryPanel,
  onChangeShowHistoryPanel,
  showDebugPanel,
  onChangeShowDebugPanel,
}) {
  return (
    <div className="settings-section">
      <label className="settings-toggle">
        <input type="checkbox" checked={!!showHistoryPanel} onChange={(e) => onChangeShowHistoryPanel(e.target.checked)} />
        <span>显示历史</span>
      </label>
      <label className="settings-toggle">
        <input type="checkbox" checked={!!showDebugPanel} onChange={(e) => onChangeShowDebugPanel(e.target.checked)} />
        <span>显示 Debug</span>
      </label>
    </div>
  );
}

