import React from 'react';

export function HomeStatusBar({
  modeLabel,
  templateName,
  audienceProfile,
  wakeWordLabel,
  currentStopLabel,
} = {}) {
  const items = [
    { key: 'mode', label: '模式', value: modeLabel },
    { key: 'template', label: '模板', value: templateName },
    { key: 'profile', label: '人群画像', value: audienceProfile },
    { key: 'wake', label: '唤醒词', value: wakeWordLabel },
    { key: 'stop', label: '当前站点', value: currentStopLabel },
  ];

  return (
    <div className="home-status-bar" role="status" aria-label="当前讲解状态">
      {items.map((item) => (
        <div className="home-status-item" key={item.key}>
          <div className="home-status-k">{item.label}</div>
          <div className="home-status-v" title={String(item.value || '')}>
            {String(item.value || '—')}
          </div>
        </div>
      ))}
    </div>
  );
}

