import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SellingPointsPanel } from './SellingPointsPanel';
import { deleteSellingPoint, listSellingPoints, upsertSellingPoint } from '../api/sellingPoints';

jest.mock('../api/sellingPoints', () => ({
  listSellingPoints: jest.fn(),
  upsertSellingPoint: jest.fn(),
  deleteSellingPoint: jest.fn(),
}));

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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('SellingPointsPanel', () => {
  beforeEach(() => {
    listSellingPoints.mockReset();
    upsertSellingPoint.mockReset();
    deleteSellingPoint.mockReset();
  });

  test('loads, upserts and deletes points', async () => {
    listSellingPoints.mockResolvedValue({ items: [{ text: 'core value', weight: 10 }] });
    upsertSellingPoint.mockResolvedValue({ ok: true });
    deleteSellingPoint.mockResolvedValue({ ok: true });

    const view = render(<SellingPointsPanel stopName="Stop A" />);
    await flush();
    expect(view.container.textContent).toContain('core value');

    const textInput = view.container.querySelector('input[placeholder]');
    act(() => {
      setInputValue(textInput, 'new point');
    });
    const allButtons = view.container.querySelectorAll('button');
    const addBtn = allButtons[0];
    await act(async () => {
      addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(upsertSellingPoint).toHaveBeenCalledWith(expect.objectContaining({ stopName: 'Stop A', text: 'new point' }));

    const deleteBtn = allButtons[2];
    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(deleteSellingPoint).toHaveBeenCalledWith({ stopName: 'Stop A', text: 'core value' });

    view.unmount();
  });

  test('shows api failure instead of treating it as an empty list', async () => {
    listSellingPoints.mockResolvedValue({ ok: false, error: 'stop_name_required' });

    const view = render(<SellingPointsPanel stopName="Stop A" />);
    await flush();

    expect(view.container.textContent).toContain('stop_name_required');

    view.unmount();
  });

  test('shows fetch failure instead of treating it as an empty list', async () => {
    listSellingPoints.mockRejectedValue(new Error('HTTP 500 /api/selling_points'));

    const view = render(<SellingPointsPanel stopName="Stop A" />);
    await flush();

    expect(view.container.textContent).toContain('HTTP 500 /api/selling_points');

    view.unmount();
  });
});
