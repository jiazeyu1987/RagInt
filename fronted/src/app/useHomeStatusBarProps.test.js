import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useHomeStatusBarProps } from './useHomeStatusBarProps';

describe('useHomeStatusBarProps', () => {
  function createProps(overrides = {}) {
    return {
      playTourRecordingEnabled: false,
      tourRecordingEnabled: false,
      setTourRecordingEnabled: jest.fn(),
      setPlayTourRecordingEnabled: jest.fn(),
      tourGuideTemplates: [
        { id: ' tpl-1 ', name: 'Template 1', stops: [{ name: 'Stop A', enabled: true }] },
      ],
      tourGuideTemplateId: 'tpl-1',
      setTourGuideTemplateId: jest.fn(),
      tourMeta: { profiles: [' General ', 'Expert'] },
      audienceProfile: ' General ',
      setAudienceProfile: jest.fn(),
      tourState: { stopIndex: 0 },
      tourStops: ['Fallback Stop'],
      wakeWordEnabled: true,
      wakeWord: ' hi ',
      ttsSpeed: '1.25',
      setTtsSpeed: jest.fn(),
      ragflowStatusLabel: 'Connected',
      ragflowStatusTone: 'ok',
      ragflowConversationLabel: 'Conversation A',
      debugInfo: { submitAt: 100 },
      serverStatus: { derived_ms: { client_submit_to_server_receive_ms: 12 } },
      ttsEnabled: true,
      ...overrides,
    };
  }

  test('builds HomeStatusBar display props from shell state', () => {
    const props = createProps({ playTourRecordingEnabled: true });
    const hook = renderHook((nextProps) => useHomeStatusBarProps(nextProps), props);
    const result = hook.result();

    expect(result.modeValue).toBe('playback');
    expect(result.currentModeLabel).toBe('播放存档');
    expect(result.modeOptions).toEqual([
      { value: 'realtime', label: '\u5b9e\u65f6\u8bb2\u89e3' },
      { value: 'recording', label: '\u5f55\u5236\u8bb2\u89e3' },
      { value: 'playback', label: '\u64ad\u653e\u5b58\u6863' },
    ]);
    expect(result.speedValue).toBe('1.25');
    expect(result.speedOptions).toEqual([
      { value: '1', label: '\u6807\u51c6(1.0x)' },
      { value: '1.25', label: '\u52a0\u5feb(1.25x)' },
      { value: '1.5', label: '\u66f4\u5feb(1.5x)' },
    ]);
    expect(result.templateValue).toBe(' tpl-1 ');
    expect(result.templateOptions).toEqual([{ value: ' tpl-1 ', label: 'Template 1' }]);
    expect(result.audienceProfileValue).toBe('General');
    expect(result.audienceProfileOptions).toEqual([
      { value: 'General', label: 'General' },
      { value: 'Expert', label: 'Expert' },
    ]);
    expect(result.ragflowStatusLabel).toBe('Connected');
    expect(result.ragflowStatusTone).toBe('ok');
    expect(result.ragflowConversationLabel).toBe('Conversation A');
    expect(result.wakeWordLabel).toBe('hi');
    expect(result.currentStopLabel).toBe('\u7b2c1\u7ad9 Stop A');
    expect(result.debugInfo).toBe(props.debugInfo);
    expect(result.serverStatus).toBe(props.serverStatus);
    expect(result.ttsEnabled).toBe(true);
  });

  test('switches playback, recording, and default modes with mutually exclusive setters', () => {
    const props = createProps();
    const hook = renderHook((nextProps) => useHomeStatusBarProps(nextProps), props);

    act(() => hook.result().onChangeMode(' playback '));
    expect(props.setTourRecordingEnabled).toHaveBeenLastCalledWith(false);
    expect(props.setPlayTourRecordingEnabled).toHaveBeenLastCalledWith(true);

    props.setTourRecordingEnabled.mockClear();
    props.setPlayTourRecordingEnabled.mockClear();
    act(() => hook.result().onChangeMode('recording'));
    expect(props.setPlayTourRecordingEnabled).toHaveBeenLastCalledWith(false);
    expect(props.setTourRecordingEnabled).toHaveBeenLastCalledWith(true);

    props.setTourRecordingEnabled.mockClear();
    props.setPlayTourRecordingEnabled.mockClear();
    act(() => hook.result().onChangeMode('realtime'));
    expect(props.setPlayTourRecordingEnabled).toHaveBeenLastCalledWith(false);
    expect(props.setTourRecordingEnabled).toHaveBeenLastCalledWith(false);
  });

  test('converts speed changes to number before updating state', () => {
    const props = createProps();
    const hook = renderHook((nextProps) => useHomeStatusBarProps(nextProps), props);

    act(() => hook.result().onChangeSpeed('1.5'));
    expect(props.setTtsSpeed).toHaveBeenCalledWith(1.5);
  });

  test('trims template and audience profile changes before updating state', () => {
    const props = createProps();
    const hook = renderHook((nextProps) => useHomeStatusBarProps(nextProps), props);

    act(() => hook.result().onChangeTemplate(' tpl-2 '));
    act(() => hook.result().onChangeAudienceProfile(' Expert '));

    expect(props.setTourGuideTemplateId).toHaveBeenCalledWith('tpl-2');
    expect(props.setAudienceProfile).toHaveBeenCalledWith('Expert');
  });

  test('returns null serverStatus when backend status is not an object', () => {
    const props = createProps({ serverStatus: 'ready' });
    const hook = renderHook((nextProps) => useHomeStatusBarProps(nextProps), props);

    expect(hook.result().serverStatus).toBeNull();
  });
});
