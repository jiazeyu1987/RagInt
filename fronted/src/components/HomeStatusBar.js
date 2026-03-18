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

function StatusText({ label, value, tone } = {}) {
  const toneCls = String(tone || '').trim();
  return (
    <div className="home-status-item" key={String(label || '')}>
      <div className="home-status-k">{String(label || '')}</div>
      <div className={`home-status-v ${toneCls}`.trim()} title={String(value || '')}>
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
  ragflowStatusLabel,
  ragflowStatusTone,
  ragflowConversationLabel,
} = {}) {
  return (
    <div className="home-status-bar" role="status" aria-label={'\u5f53\u524d\u8bb2\u89e3\u72b6\u6001'}>
      <StatusSelect label={'\u5f53\u524d\u6a21\u5f0f'} value={modeValue} options={modeOptions} onChange={onChangeMode} />
      <StatusSelect label={'\u8bed\u901f'} value={speedValue} options={speedOptions} onChange={onChangeSpeed} />
      <StatusSelect label={'\u6a21\u677f\u540d\u79f0'} value={templateValue} options={templateOptions} onChange={onChangeTemplate} />
      <StatusSelect
        label={'\u4eba\u7fa4\u753b\u50cf'}
        value={audienceProfileValue}
        options={audienceProfileOptions}
        onChange={onChangeAudienceProfile}
      />
      <StatusText label="RAGFlow" value={ragflowStatusLabel || '\u68c0\u6d4b\u4e2d'} tone={ragflowStatusTone} />
      <StatusText label={'RAGFlow 对话'} value={ragflowConversationLabel || '\u65e0'} />
      <StatusText label={'\u5524\u9192\u8bcd'} value={wakeWordLabel} />
      <StatusText label={'\u5f53\u524d\u7ad9\u70b9'} value={currentStopLabel} />
    </div>
  );
}
