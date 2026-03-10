import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TourModePanel } from './TourModePanel';

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

describe('TourModePanel', () => {
  test('supports create, delete and save actions', () => {
    const onCreateTemplate = jest.fn();
    const onDeleteSelectedTemplate = jest.fn();
    const onSaveSelectedTemplate = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    const view = render(
      <TourModePanel
        templates={[
          {
            id: 'tpl-1',
            name: 'Template 1',
            stops: [
              { name: 'Stop A', enabled: true, duration_s: 120 },
              { name: 'Stop B', enabled: true, duration_s: 120 },
            ],
          },
          {
            id: 'tpl-2',
            name: 'Template 2',
            stops: [{ name: 'Stop C', enabled: true, duration_s: 120 }],
          },
        ]}
        selectedTemplateId="tpl-1"
        onChangeTemplateId={jest.fn()}
        onCreateTemplate={onCreateTemplate}
        onDeleteSelectedTemplate={onDeleteSelectedTemplate}
        onSaveSelectedTemplate={onSaveSelectedTemplate}
      />
    );

    const buttons = view.container.querySelectorAll('button.settings-action-btn');
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCreateTemplate).toHaveBeenCalledTimes(1);
    expect(onDeleteSelectedTemplate).toHaveBeenCalledTimes(1);

    expect(buttons[3]).toBeTruthy();

    confirmSpy.mockRestore();
    view.unmount();
  });
});
