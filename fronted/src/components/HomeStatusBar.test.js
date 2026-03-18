import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HomeStatusBar } from './HomeStatusBar';

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

describe('HomeStatusBar', () => {
  test('shows status fields and handles select changes', () => {
    const onChangeMode = jest.fn();
    const onChangeSpeed = jest.fn();
    const onChangeTemplate = jest.fn();
    const onChangeAudienceProfile = jest.fn();

    const view = render(
      <HomeStatusBar
        modeValue="realtime"
        modeOptions={[{ value: 'realtime', label: 'Realtime' }, { value: 'recording', label: 'Recording' }]}
        onChangeMode={onChangeMode}
        speedValue="1"
        speedOptions={[{ value: '1', label: '1x' }, { value: '1.25', label: '1.25x' }]}
        onChangeSpeed={onChangeSpeed}
        templateValue="tpl-1"
        templateOptions={[{ value: 'tpl-1', label: 'Template 1' }]}
        onChangeTemplate={onChangeTemplate}
        audienceProfileValue="General"
        audienceProfileOptions={[{ value: 'General', label: 'General' }, { value: 'Kids', label: 'Kids' }]}
        onChangeAudienceProfile={onChangeAudienceProfile}
        wakeWordLabel="hello assistant"
        currentStopLabel="Stop A"
        ragflowConversationLabel="展厅聊天"
      />
    );

    const selects = view.container.querySelectorAll('select.home-status-select');
    selects[0].value = 'recording';
    selects[1].value = '1.25';
    selects[2].value = 'tpl-1';
    selects[3].value = 'Kids';
    act(() => {
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      selects[2].dispatchEvent(new Event('change', { bubbles: true }));
      selects[3].dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChangeMode).toHaveBeenCalledWith('recording');
    expect(onChangeSpeed).toHaveBeenCalledWith('1.25');
    expect(onChangeTemplate).toHaveBeenCalledWith('tpl-1');
    expect(onChangeAudienceProfile).toHaveBeenCalledWith('Kids');
    expect(view.container.textContent).toContain('hello assistant');
    expect(view.container.textContent).toContain('Stop A');
    expect(view.container.textContent).toContain('展厅聊天');

    view.unmount();
  });

  test('falls back to 无 when ragflow conversation is absent', () => {
    const view = render(<HomeStatusBar ragflowConversationLabel="" />);
    expect(view.container.textContent).toContain('无');
    view.unmount();
  });
});

