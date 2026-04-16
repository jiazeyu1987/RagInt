import React from 'react';

export function HomeActions({
  onBackToSimple,
  onOpenPadHome,
  onTourToggle,
  tourToggleLabel,
  tourToggleDanger,
  tourToggleDisabled,
  onReset,
}) {
  const showBackButton = typeof onBackToSimple === 'function';
  const showPadHomeButton = typeof onOpenPadHome === 'function';
  const actionCount = 2 + (showBackButton ? 1 : 0) + (showPadHomeButton ? 1 : 0);

  return (
    <div className="home-actions" style={{ '--home-actions-columns': String(actionCount) }}>
      {showBackButton ? (
        <button type="button" className="home-action-btn home-action-neutral" onClick={onBackToSimple}>
          {'\u6781\u7b80\u9875'}
        </button>
      ) : null}
      {showPadHomeButton ? (
        <button type="button" className="home-action-btn home-action-neutral" onClick={onOpenPadHome}>
          {'\u8fd4\u56de\u4ea7\u54c1\u8bb2\u89e3'}
        </button>
      ) : null}
      <button
        type="button"
        className={`home-action-btn ${tourToggleDanger ? 'home-action-danger' : 'home-action-primary'}`}
        onClick={onTourToggle}
        disabled={!!tourToggleDisabled}
      >
        {tourToggleLabel || '\u5f00\u59cb\u8bb2\u89e3'}
      </button>
      <button type="button" className="home-action-btn" onClick={onReset}>
        {'\u590d\u4f4d'}
      </button>
    </div>
  );
}
