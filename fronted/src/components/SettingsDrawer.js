import React, { useEffect } from 'react';

export function SettingsDrawer({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e && e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="settings-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e && e.target === e.currentTarget) onClose && onClose();
      }}
    >
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label={title || '设置'}>
        <div className="settings-header">
          <div className="settings-title">{title || '设置'}</div>
          <button type="button" className="settings-close" onClick={() => onClose && onClose()} aria-label="关闭设置">
            ×
          </button>
        </div>
        <div className="settings-body">{children}</div>
      </aside>
    </div>
  );
}

