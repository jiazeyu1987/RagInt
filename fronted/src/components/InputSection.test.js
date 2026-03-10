import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { InputSection } from './InputSection';
import { HomeActions } from './HomeActions';
import { TextInputControls } from './TextInputControls';

jest.mock('./HomeActions', () => {
  const ReactRef = require('react');
  return {
    HomeActions: jest.fn(() => ReactRef.createElement('div', { 'data-testid': 'home-actions' })),
  };
});

jest.mock('./TextInputControls', () => {
  const ReactRef = require('react');
  return {
    TextInputControls: jest.fn(({ children }) => ReactRef.createElement('div', { 'data-testid': 'text-input-controls' }, children)),
  };
});

function render(ui) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

describe('InputSection', () => {
  beforeEach(() => {
    HomeActions.mockClear();
    TextInputControls.mockClear();
  });

  test('passes action props to HomeActions and input props to TextInputControls', () => {
    const onTourToggle = jest.fn();
    const onReset = jest.fn();
    const onSubmit = jest.fn();
    const textInputProps = { sendBtnClassName: 'submit-btn submit-btn-normal', inputText: 'hello' };

    const view = render(
      <InputSection
        onTourToggle={onTourToggle}
        tourToggleLabel="toggle"
        tourToggleDanger
        tourToggleDisabled={false}
        onReset={onReset}
        onSubmit={onSubmit}
        textInputProps={textInputProps}
      >
        <span data-testid="child-slot">slot</span>
      </InputSection>
    );

    expect(HomeActions).toHaveBeenCalledTimes(1);
    const homeActionsProps = HomeActions.mock.calls[0][0];
    expect(homeActionsProps).toEqual(
      expect.objectContaining({
        onTourToggle,
        tourToggleLabel: 'toggle',
        tourToggleDanger: true,
        tourToggleDisabled: false,
        onReset,
      })
    );

    expect(TextInputControls).toHaveBeenCalledTimes(1);
    const textInputPropsArg = TextInputControls.mock.calls[0][0];
    expect(textInputPropsArg).toEqual(expect.objectContaining({ onSubmit, sendBtnClassName: 'submit-btn submit-btn-normal' }));

    expect(textInputPropsArg.children).toBeTruthy();
    expect(textInputPropsArg.children.props).toEqual(expect.objectContaining({ 'data-testid': 'child-slot' }));
    view.unmount();
  });
});
