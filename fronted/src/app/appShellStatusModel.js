export function buildAppShellStatusModel({
  playTourRecordingEnabled = false,
  tourRecordingEnabled = false,
  tourGuideTemplates = [],
  tourGuideTemplateId = '',
  tourMeta = {},
  audienceProfile = '',
  tourState = null,
  tourStops = [],
  wakeWordEnabled = false,
  wakeWord = '',
} = {}) {
  const guideTemplateList = Array.isArray(tourGuideTemplates) ? tourGuideTemplates : [];
  const selectedGuideTemplate =
    guideTemplateList.find((tpl) => String((tpl && tpl.id) || '').trim() === String(tourGuideTemplateId || '').trim()) ||
    guideTemplateList[0] ||
    null;
  const guideTemplateOptions = guideTemplateList.length
    ? guideTemplateList.map((tpl) => ({
        value: String((tpl && tpl.id) || ''),
        label: String((tpl && (tpl.name || tpl.id)) || '\u6a21\u677f'),
      }))
    : [{ value: '', label: '\u6682\u65e0\u6a21\u677f' }];
  const templateOrderedStops =
    selectedGuideTemplate && Array.isArray(selectedGuideTemplate.stops)
      ? selectedGuideTemplate.stops
          .filter((row) => row && row.enabled !== false)
          .map((row) => String((row && row.name) || '').trim())
          .filter(Boolean)
      : [];

  let currentModeLabel = '\u5b9e\u65f6\u8bb2\u89e3';
  if (playTourRecordingEnabled) currentModeLabel = '\u64ad\u653e\u5b58\u6863';
  else if (tourRecordingEnabled) currentModeLabel = '\u5f55\u5236\u8bb2\u89e3';
  const currentModeValue = playTourRecordingEnabled ? 'playback' : tourRecordingEnabled ? 'recording' : 'realtime';
  const modeOptions = [
    { value: 'realtime', label: '\u5b9e\u65f6\u8bb2\u89e3' },
    { value: 'recording', label: '\u5f55\u5236\u8bb2\u89e3' },
    { value: 'playback', label: '\u64ad\u653e\u5b58\u6863' },
  ];
  const audienceProfileOptions = (tourMeta && Array.isArray(tourMeta.profiles) ? tourMeta.profiles : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => ({ value: item, label: item }));
  const speedOptions = [
    { value: '1', label: '\u6807\u51c6(1.0x)' },
    { value: '1.25', label: '\u52a0\u5feb(1.25x)' },
    { value: '1.5', label: '\u66f4\u5feb(1.5x)' },
  ];

  const currentStopIndexFromState =
    tourState && Number.isFinite(tourState.stopIndex) && Number(tourState.stopIndex) >= 0
      ? Number(tourState.stopIndex)
      : -1;
  const stopList = Array.isArray(tourStops) ? tourStops : [];
  const fallbackStopName =
    currentStopIndexFromState >= 0 && currentStopIndexFromState < stopList.length
      ? String(stopList[currentStopIndexFromState] || '').trim()
      : '';
  const runtimeStopName = String((tourState && tourState.stopName) || fallbackStopName || '').trim();
  const templateStopNameByIndex =
    currentStopIndexFromState >= 0 && currentStopIndexFromState < templateOrderedStops.length
      ? String(templateOrderedStops[currentStopIndexFromState] || '').trim()
      : '';
  const currentStopName = templateStopNameByIndex || runtimeStopName;
  let displayStopIndex = currentStopIndexFromState;
  if (currentStopName && templateOrderedStops.length) {
    const idxInTemplate = templateOrderedStops.findIndex((name) => String(name || '').trim() === currentStopName);
    if (idxInTemplate >= 0) displayStopIndex = idxInTemplate;
  }
  const currentStopLabel =
    displayStopIndex >= 0
      ? `\u7b2c${displayStopIndex + 1}\u7ad9${currentStopName ? ` ${currentStopName}` : ''}`
      : '\u672a\u5f00\u59cb';
  const wakeWordLabel = wakeWordEnabled ? String(wakeWord || '').trim() || '\u672a\u8bbe\u7f6e' : '\u672a\u542f\u7528';
  const audienceProfileLabel = String(audienceProfile || '').trim() || '\u672a\u8bbe\u7f6e';

  return {
    selectedGuideTemplate,
    guideTemplateOptions,
    templateOrderedStops,
    currentModeLabel,
    currentModeValue,
    modeOptions,
    audienceProfileOptions,
    speedOptions,
    currentStopLabel,
    wakeWordLabel,
    audienceProfileLabel,
  };
}
