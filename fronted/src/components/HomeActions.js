import React from 'react';

export function HomeActions({ onTourToggle, tourToggleLabel, tourToggleDanger, tourToggleDisabled, onReset }) {
  return (
    <div className="home-actions">
      <button
        type="button"
        className={`home-action-btn ${tourToggleDanger ? 'home-action-danger' : 'home-action-primary'}`}
        onClick={onTourToggle}
        disabled={!!tourToggleDisabled}
      >
        {tourToggleLabel || '开始讲解'}
      </button>
      <button type="button" className="home-action-btn" onClick={onReset}>
        复位
      </button>
    </div>
  );
}
