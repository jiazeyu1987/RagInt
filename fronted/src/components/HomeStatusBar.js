import React from 'react';

function StatusSelect({ label, value, options, onChange, disabled } = {}) {
  const list = Array.isArray(options) ? options : [];
  return (
    <div className="home-status-item" key={String(label || '')}>
      <div className="home-status-k">{String(label || '')}</div>
      <select
        className="home-status-select"
        value={String(value || '')}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={!!disabled || !list.length}
        aria-label={String(label || '')}
      >
        {list.map((item) => (
          <option key={String(item && item.value)} value={String(item && item.value)}>
            {String((item && item.label) || (item && item.value) || '')}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusText({ label, value } = {}) {
  return (
    <div className="home-status-item" key={String(label || '')}>
      <div className="home-status-k">{String(label || '')}</div>
      <div className="home-status-v" title={String(value || '')}>
        {String(value || '-')}
      </div>
    </div>
  );
}

export function HomeStatusBar({
  modeValue,
  modeOptions,
  onChangeMode,
  speedValue,
  speedOptions,
  onChangeSpeed,
  templateValue,
  templateOptions,
  onChangeTemplate,
  audienceProfileValue,
  audienceProfileOptions,
  onChangeAudienceProfile,
  wakeWordLabel,
  currentStopLabel,
} = {}) {
  return (
    <div className="home-status-bar" role="status" aria-label="当前讲解状态">
      <StatusSelect label="当前模式" value={modeValue} options={modeOptions} onChange={onChangeMode} />
      <StatusSelect label="语速" value={speedValue} options={speedOptions} onChange={onChangeSpeed} />
      <StatusSelect label="模板名称" value={templateValue} options={templateOptions} onChange={onChangeTemplate} />
      <StatusSelect
        label="人群画像"
        value={audienceProfileValue}
        options={audienceProfileOptions}
        onChange={onChangeAudienceProfile}
      />
      <StatusText label="唤醒词" value={wakeWordLabel} />
      <StatusText label="当前站点" value={currentStopLabel} />
    </div>
  );
}
