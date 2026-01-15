import React from 'react';

export function HomeActions({ onStartTour, onInterrupt, interruptDisabled, onContinueTour }) {
  return (
    <div className="home-actions">
      <button type="button" className="home-action-btn home-action-primary" onClick={onStartTour}>
        开始讲解
      </button>
      <button
        type="button"
        className="home-action-btn home-action-danger"
        onClick={onInterrupt}
        disabled={!!interruptDisabled}
      >
        打断
      </button>
      <button type="button" className="home-action-btn" onClick={onContinueTour}>
        继续讲解
      </button>
    </div>
  );
}
