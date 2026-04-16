import React from 'react';
import { HomeActions } from './HomeActions';
import { TextInputControls } from './TextInputControls';

export function InputSection({
  onBackToSimple,
  onOpenPadHome,
  onTourToggle,
  tourToggleLabel,
  tourToggleDanger,
  tourToggleDisabled,
  onReset,
  onSubmit,
  textInputProps,
  children,
}) {
  return (
    <div className="input-section">
      <HomeActions
        onBackToSimple={onBackToSimple}
        onOpenPadHome={onOpenPadHome}
        onTourToggle={onTourToggle}
        tourToggleLabel={tourToggleLabel}
        tourToggleDanger={tourToggleDanger}
        tourToggleDisabled={tourToggleDisabled}
        onReset={onReset}
      />
      <TextInputControls onSubmit={onSubmit} {...(textInputProps || {})}>
        {children}
      </TextInputControls>
    </div>
  );
}
