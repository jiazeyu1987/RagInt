import React, { useEffect, useMemo, useState } from 'react';

function cloneStops(stops) {
  return Array.isArray(stops)
    ? stops.map((row) => ({
        name: String((row && row.name) || '').trim(),
        enabled: row && row.enabled !== false,
        duration_s: Number.isFinite(Number(row && row.duration_s)) ? Math.max(1, Math.min(3600, Math.round(Number(row.duration_s)))) : 120,
      }))
    : [];
}

export function TourModePanel({
  templates,
  selectedTemplateId,
  selectedTemplate: selectedTemplateFromProps,
  onChangeTemplateId,
  onCreateTemplate,
  onDeleteSelectedTemplate,
  onSaveSelectedTemplate,
} = {}) {
  const tplList = useMemo(() => (Array.isArray(templates) ? templates : []), [templates]);
  const selectedTemplate = useMemo(() => {
    if (selectedTemplateFromProps && typeof selectedTemplateFromProps === 'object') return selectedTemplateFromProps;
    const id = String(selectedTemplateId || '').trim();
    if (!id) return tplList.length ? tplList[0] : null;
    return tplList.find((t) => String(t && t.id).trim() === id) || (tplList.length ? tplList[0] : null);
  }, [selectedTemplateFromProps, selectedTemplateId, tplList]);

  const [draftName, setDraftName] = useState('');
  const [draftRows, setDraftRows] = useState([]);
  const [dragFromIndex, setDragFromIndex] = useState(-1);
  const [dragOverIndex, setDragOverIndex] = useState(-1);

  useEffect(() => {
    setDraftName(String((selectedTemplate && selectedTemplate.name) || ''));
    setDraftRows(cloneStops(selectedTemplate && selectedTemplate.stops));
    setDragFromIndex(-1);
    setDragOverIndex(-1);
  }, [selectedTemplate]);

  const dirty = useMemo(() => {
    if (!selectedTemplate) return false;
    const nameChanged = String(draftName || '').trim() !== String(selectedTemplate.name || '').trim();
    const rowsChanged = JSON.stringify(cloneStops(draftRows)) !== JSON.stringify(cloneStops(selectedTemplate.stops));
    return nameChanged || rowsChanged;
  }, [draftName, draftRows, selectedTemplate]);

  return (
    <div className="settings-block">
      <label className="settings-field" style={{ display: 'block', marginBottom: 8 }}>
        <span>选择模板</span>
        <select
          value={String((selectedTemplate && selectedTemplate.id) || selectedTemplateId || '')}
          onChange={(e) => onChangeTemplateId && onChangeTemplateId(e.target.value)}
        >
          {(tplList.length ? tplList : [{ id: '', name: '（暂无模板）' }]).map((tpl) => (
            <option key={String(tpl.id)} value={String(tpl.id)}>
              {String(tpl.name || tpl.id || '模板')}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={() => onCreateTemplate && onCreateTemplate()}>
          新建模板
        </button>
        <button
          type="button"
          className="settings-action-btn settings-action-btn-danger"
          onClick={() => {
            if (!selectedTemplate || !onDeleteSelectedTemplate || tplList.length <= 1) return;
            const ok = window.confirm(`确认删除模板「${String(selectedTemplate.name || selectedTemplate.id || '')}」吗？`);
            if (!ok) return;
            onDeleteSelectedTemplate();
          }}
          disabled={!selectedTemplate || tplList.length <= 1}
          title={tplList.length <= 1 ? '至少保留一个模板' : ''}
        >
          删除模板
        </button>
      </div>

      <label className="settings-field" style={{ display: 'block', marginBottom: 8 }}>
        <span>模板名称</span>
        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="模板名称" />
      </label>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
        可设置展厅顺序、是否讲解、每站讲解时长（秒）。拖拽左侧手柄即可排序，点击“保存模板”后写入模板。
      </div>

      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid rgba(0,0,0,0.08)', padding: 8 }}>
        {draftRows.length ? (
          draftRows.map((row, i) => (
            <div
              key={`${String(row.name)}_${i}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverIndex !== i) setDragOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
                const from = dragFromIndex >= 0 ? dragFromIndex : Number(raw);
                const to = i;
                if (!Number.isFinite(from) || from < 0 || from >= draftRows.length || to < 0 || to >= draftRows.length || from === to) {
                  setDragFromIndex(-1);
                  setDragOverIndex(-1);
                  return;
                }
                setDraftRows((prev) => {
                  if (!Array.isArray(prev) || from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
                  const next = [...prev];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  return next;
                });
                setDragFromIndex(-1);
                setDragOverIndex(-1);
              }}
              onDragLeave={() => {
                if (dragOverIndex === i) setDragOverIndex(-1);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px minmax(140px,1fr) 78px 96px',
                gap: 8,
                alignItems: 'center',
                marginBottom: 6,
                background: dragOverIndex === i ? 'rgba(0,0,0,0.05)' : 'transparent',
                borderRadius: 6,
                padding: '2px 4px',
              }}
            >
              <button
                type="button"
                className="template-drag-handle"
                title="拖拽排序"
                draggable
                onDragStart={(e) => {
                  setDragFromIndex(i);
                  setDragOverIndex(i);
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }
                }}
                onDragEnd={() => {
                  setDragFromIndex(-1);
                  setDragOverIndex(-1);
                }}
              >
                ☰
              </button>
              <div title={String(row.name)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12, opacity: 0.75, marginRight: 6 }}>{i + 1}.</span>
                {String(row.name)}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={row.enabled !== false}
                  onChange={(e) =>
                    setDraftRows((prev) =>
                      prev.map((it, idx) => (idx === i ? { ...it, enabled: e.target.checked } : it))
                    )
                  }
                />
                <span style={{ fontSize: 12 }}>讲解</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={String(Number(row.duration_s) || 120)}
                onChange={(e) => {
                  const digits = String(e.target.value || '').replace(/[^\d]/g, '');
                  if (!digits) return;
                  const n = Number(digits);
                  if (!Number.isFinite(n) || n <= 0) return;
                  const nextDuration = Math.max(1, Math.min(3600, Math.round(n)));
                  setDraftRows((prev) =>
                    prev.map((it, idx) => (idx === i ? { ...it, duration_s: nextDuration } : it))
                  );
                }}
                style={{ width: '100%' }}
              />
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>暂无站点</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button
          type="button"
          className="settings-action-btn"
          onClick={() => {
            if (!selectedTemplate) return;
            setDraftName(String(selectedTemplate.name || ''));
            setDraftRows(cloneStops(selectedTemplate.stops));
          }}
          disabled={!dirty}
        >
          取消修改
        </button>
        <button
          type="button"
          className="settings-action-btn settings-action-btn-primary"
          onClick={() => {
            if (!selectedTemplate || !onSaveSelectedTemplate) return;
            const payload = {
              ...selectedTemplate,
              name: String(draftName || '').trim() || String(selectedTemplate.name || ''),
              stops: cloneStops(draftRows),
            };
            onSaveSelectedTemplate(payload);
          }}
          disabled={!selectedTemplate || !dirty}
        >
          保存修改
        </button>
      </div>
    </div>
  );
}
