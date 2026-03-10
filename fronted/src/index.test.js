import React from 'react';

const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({ render: mockRender }));
const mockApp = jest.fn(() => null);

jest.mock('react-dom/client', () => ({
  __esModule: true,
  default: {
    createRoot: mockCreateRoot,
  },
  createRoot: mockCreateRoot,
}));

jest.mock('./App', () => ({
  __esModule: true,
  default: mockApp,
}));

describe('index bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRender.mockClear();
    mockCreateRoot.mockClear();
    mockApp.mockClear();
    mockCreateRoot.mockImplementation(() => ({ render: mockRender }));
    document.body.innerHTML = '<div id="root"></div>';
  });

  test('creates root and renders app in strict mode', () => {
    require('./index');

    const rootEl = document.getElementById('root');
    expect(mockCreateRoot).toHaveBeenCalledWith(rootEl);
    expect(mockRender).toHaveBeenCalledTimes(1);

    const renderedTree = mockRender.mock.calls[0][0];
    expect(renderedTree.type).toBe(React.StrictMode);
    expect(renderedTree.props.children.type).toBe(mockApp);
  });
});
