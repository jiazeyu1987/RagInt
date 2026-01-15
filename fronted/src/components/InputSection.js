import React from 'react';
import { HomeActions } from './HomeActions';
import { TextInputControls } from './TextInputControls';

export function InputSection({
  onStartTour,
  onInterrupt,
  interruptDisabled,
  onContinueTour,
  onSubmit,
  textInputProps,
  children,
}) {
  return (
    <div className="input-section">
      <HomeActions
        onStartTour={onStartTour}
        onInterrupt={onInterrupt}
        interruptDisabled={interruptDisabled}
        onContinueTour={onContinueTour}
      />
      <TextInputControls onSubmit={onSubmit} {...(textInputProps || {})}>
        {children}
      </TextInputControls>
    </div>
  );
}
