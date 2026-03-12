import React from 'react';

export function SimpleTourControlPage({ isRunning, showWave, onToggle, onOpenMainPage }) {
  const running = !!isRunning;
  const waveVisible = !!showWave;
  const mainBtnLabel = running ? '\u505c\u6b62' : '\u5f00\u59cb';
  const mainBtnAriaLabel = running ? '\u505c\u6b62\u8bb2\u89e3' : '\u5f00\u59cb\u8bb2\u89e3';
  const waveBars = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="simple-tour-page">
      <div className="simple-tour-bg simple-tour-bg-a" aria-hidden="true" />
      <div className="simple-tour-bg simple-tour-bg-b" aria-hidden="true" />
      <div className="simple-tour-panel">
        <button
          type="button"
          className="simple-tour-title-btn"
          onClick={onOpenMainPage}
          aria-label="\u8fdb\u5165\u4e3b\u9875\u9762"
          title="\u8fdb\u5165\u4e3b\u9875\u9762"
        >
          <span className="simple-tour-title">{'\u667a\u80fd\u8bb2\u89e3\u63a7\u5236'}</span>
        </button>
        <div className="simple-tour-subtitle">{running ? '\u8bb2\u89e3\u8fdb\u884c\u4e2d' : '\u51c6\u5907\u5f00\u59cb\u8bb2\u89e3'}</div>

        <div className="simple-tour-main-wrap">
          <button
            type="button"
            className={`simple-tour-main-btn ${running ? 'is-stop' : 'is-start'}`}
            onClick={onToggle}
            aria-label={mainBtnAriaLabel}
          >
            <span
              className={`simple-tour-main-icon ${running ? 'simple-tour-main-icon-stop' : 'simple-tour-main-icon-start'}`}
              aria-hidden="true"
            />
            <span className="simple-tour-main-label">{mainBtnLabel}</span>
          </button>
        </div>

        <div className={`simple-tour-wave ${waveVisible ? '' : 'is-hidden'}`} aria-label="\u64ad\u653e\u97f3\u6d6a">
          {waveBars.map((idx) => (
            <span
              key={idx}
              className="simple-tour-wave-bar"
              style={{ animationDelay: `${idx * 0.09}s` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default SimpleTourControlPage;
