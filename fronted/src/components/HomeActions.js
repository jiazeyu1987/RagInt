import React from 'react';

export function HomeActions({
  onBackToSimple,
  onTourToggle,
  tourToggleLabel,
  tourToggleDanger,
  tourToggleDisabled,
  onReset,
}) {
  const showBackButton = typeof onBackToSimple === 'function';

  return (
    <div className={`home-actions ${showBackButton ? 'home-actions-with-back' : ''}`}>
      {showBackButton ? (
        <button type="button" className="home-action-btn home-action-neutral" onClick={onBackToSimple}>
          {'\u6781\u7b80\u9875'}
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
