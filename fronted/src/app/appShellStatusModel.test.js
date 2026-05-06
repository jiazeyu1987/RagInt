import { buildAppShellStatusModel } from './appShellStatusModel';

describe('buildAppShellStatusModel', () => {
  test('builds mode, template, speed, and audience options', () => {
    const model = buildAppShellStatusModel({
      playTourRecordingEnabled: true,
      tourRecordingEnabled: false,
      tourGuideTemplates: [
        { id: 'tpl-1', name: 'Template 1', stops: [{ name: 'Stop A', enabled: true }] },
        { id: 'tpl-2', name: '', stops: [] },
      ],
      tourGuideTemplateId: 'tpl-1',
      tourMeta: { profiles: ['General', '', 'Expert'] },
      audienceProfile: 'General',
    });

    expect(model.currentModeValue).toBe('playback');
    expect(model.currentModeLabel).toBe('\u64ad\u653e\u5b58\u6863');
    expect(model.modeOptions).toEqual([
      { value: 'realtime', label: '\u5b9e\u65f6\u8bb2\u89e3' },
      { value: 'recording', label: '\u5f55\u5236\u8bb2\u89e3' },
      { value: 'playback', label: '\u64ad\u653e\u5b58\u6863' },
    ]);
    expect(model.selectedGuideTemplate.id).toBe('tpl-1');
    expect(model.guideTemplateOptions).toEqual([
      { value: 'tpl-1', label: 'Template 1' },
      { value: 'tpl-2', label: 'tpl-2' },
    ]);
    expect(model.templateOrderedStops).toEqual(['Stop A']);
    expect(model.speedOptions).toEqual([
      { value: '1', label: '\u6807\u51c6(1.0x)' },
      { value: '1.25', label: '\u52a0\u5feb(1.25x)' },
      { value: '1.5', label: '\u66f4\u5feb(1.5x)' },
    ]);
    expect(model.audienceProfileOptions).toEqual([
      { value: 'General', label: 'General' },
      { value: 'Expert', label: 'Expert' },
    ]);
    expect(model.audienceProfileLabel).toBe('General');
  });

  test('builds current stop and wake word labels', () => {
    const model = buildAppShellStatusModel({
      tourGuideTemplates: [{ id: 'tpl-1', stops: [{ name: 'Template Stop', enabled: true }] }],
      tourGuideTemplateId: 'tpl-1',
      tourState: { stopIndex: 0, stopName: 'Runtime Stop' },
      tourStops: ['Fallback Stop'],
      wakeWordEnabled: true,
      wakeWord: '',
      audienceProfile: '',
    });

    expect(model.currentStopLabel).toBe('\u7b2c1\u7ad9 Template Stop');
    expect(model.wakeWordLabel).toBe('\u672a\u8bbe\u7f6e');
    expect(model.audienceProfileLabel).toBe('\u672a\u8bbe\u7f6e');
  });

  test('uses empty labels when no templates or active stop exist', () => {
    const model = buildAppShellStatusModel({
      wakeWordEnabled: false,
    });

    expect(model.selectedGuideTemplate).toBeNull();
    expect(model.guideTemplateOptions).toEqual([{ value: '', label: '\u6682\u65e0\u6a21\u677f' }]);
    expect(model.currentStopLabel).toBe('\u672a\u5f00\u59cb');
    expect(model.wakeWordLabel).toBe('\u672a\u542f\u7528');
    expect(model.currentModeValue).toBe('realtime');
  });
});
