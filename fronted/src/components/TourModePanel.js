import React, { useMemo } from 'react';

function normalizeStops(list) {
  return Array.isArray(list) ? list.map((s) => String(s || '').trim()).filter(Boolean) : [];
}

export function TourModePanel({
  tourMode,
  onChangeTourMode,
  templates,
  tourTemplateId,
  onChangeTourTemplateId,
  tourStopsOverride,
  onChangeTourStopsOverride,
  onApplyTemplateZone,
} = {}) {
  const tplList = useMemo(() => (Array.isArray(templates) ? templates : []), [templates]);
  const selectedTemplate = useMemo(() => {
    const id = String(tourTemplateId || '').trim();
    if (!id) return tplList.length ? tplList[0] : null;
    return tplList.find((t) => String(t && t.id).trim() === id) || (tplList.length ? tplList[0] : null);
  }, [tplList, tourTemplateId]);

  const baseStops = normalizeStops(selectedTemplate && selectedTemplate.stops);
  const overrideStops = normalizeStops(tourStopsOverride);
  const selectedSet = useMemo(() => new Set(overrideStops), [overrideStops]);

  return (
    <div className="settings-section">
      <div className="settings-title" style={{ fontWeight: 600, marginBottom: 8 }}>
        讲解模式
      </div>

      <label className="kb-select" style={{ display: 'block', marginBottom: 8 }}>
        <span>模式</span>
        <select value={String(tourMode || 'basic')} onChange={(e) => onChangeTourMode && onChangeTourMode(e.target.value)}>
          <option value="basic">基础模式（固定流程）</option>
          <option value="personalized">个性化模式（勾选生成）</option>
        </select>
      </label>

      <label className="kb-select" style={{ display: 'block', marginBottom: 8 }}>
        <span>模板</span>
        <select
          value={String((selectedTemplate && selectedTemplate.id) || tourTemplateId || '')}
          onChange={(e) => onChangeTourTemplateId && onChangeTourTemplateId(e.target.value)}
        >
          {(tplList.length ? tplList : [{ id: '', name: '（暂无模板）' }]).map((t) => (
            <option key={String(t.id)} value={String(t.id)}>
              {String(t.name || t.id || '模板')}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (!selectedTemplate) return;
            const stops = normalizeStops(selectedTemplate.stops);
            if (onChangeTourStopsOverride) onChangeTourStopsOverride(stops);
            const zone = String((selectedTemplate && selectedTemplate.zone) || '').trim();
            if (zone && typeof onApplyTemplateZone === 'function') onApplyTemplateZone(zone);
          }}
          disabled={!selectedTemplate}
        >
          应用模板
        </button>
        <button type="button" onClick={() => onChangeTourStopsOverride && onChangeTourStopsOverride([])}>
          清空自定义
        </button>
      </div>

      {String(tourMode || 'basic') === 'personalized' ? (
        <>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>勾选要讲解的展柜（按模板顺序）：</div>
          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid rgba(0,0,0,0.08)', padding: 8 }}>
            {baseStops.length ? (
              baseStops.map((s) => (
                <label key={s} style={{ display: 'block', marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(s)}
                    onChange={(e) => {
                      const next = new Set(selectedSet);
                      if (e.target.checked) next.add(s);
                      else next.delete(s);
                      if (onChangeTourStopsOverride) onChangeTourStopsOverride(Array.from(next));
                    }}
                  />{' '}
                  {s}
                </label>
              ))
            ) : (
              <div style={{ fontSize: 12, opacity: 0.75 }}>暂无可选站点（请先选择模板）</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" onClick={() => onChangeTourStopsOverride && onChangeTourStopsOverride(baseStops)} disabled={!baseStops.length}>
              全选
            </button>
            <button type="button" onClick={() => onChangeTourStopsOverride && onChangeTourStopsOverride([])}>
              全不选
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          基础模式下会使用模板的固定站点列表；也可以“应用模板”后开始讲解。
        </div>
      )}
    </div>
  );
}
