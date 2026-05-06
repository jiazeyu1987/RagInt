import { renderHook } from '../testUtils/renderHook';
import { useTourRecordingPlaybackSelection } from './useTourRecordingPlaybackSelection';

describe('useTourRecordingPlaybackSelection', () => {
  function buildProps(overrides = {}) {
    return {
      tourRecordingEnabled: true,
      setTourRecordingEnabled: jest.fn(),
      playTourRecordingEnabled: true,
      setPlayTourRecordingEnabled: jest.fn(),
      tourRecordingOptionsReady: true,
      tourRecordingOptions: [{ recording_id: 'rec-1' }, { recording_id: 'rec-2' }],
      selectedTourRecordingId: 'rec-1',
      setSelectedTourRecordingId: jest.fn(),
      ...overrides,
    };
  }

  test('turns off recording mode when playback mode is enabled', async () => {
    const props = buildProps();
    const hook = renderHook((nextProps) => useTourRecordingPlaybackSelection(nextProps), props);

    await hook.flush();

    expect(props.setTourRecordingEnabled).toHaveBeenCalledWith(false);
  });

  test('keeps an existing selected recording id', async () => {
    const props = buildProps({ selectedTourRecordingId: 'rec-2' });
    const hook = renderHook((nextProps) => useTourRecordingPlaybackSelection(nextProps), props);

    await hook.flush();

    expect(props.setSelectedTourRecordingId).not.toHaveBeenCalled();
    expect(props.setPlayTourRecordingEnabled).not.toHaveBeenCalled();
  });

  test('selects the first available recording when the selected id is missing', async () => {
    const props = buildProps({ selectedTourRecordingId: 'missing' });
    const hook = renderHook((nextProps) => useTourRecordingPlaybackSelection(nextProps), props);

    await hook.flush();

    expect(props.setSelectedTourRecordingId).toHaveBeenCalledWith('rec-1');
    expect(props.setPlayTourRecordingEnabled).not.toHaveBeenCalled();
  });

  test('turns playback off and clears missing selection when no recordings are available', async () => {
    const props = buildProps({ selectedTourRecordingId: 'missing', tourRecordingOptions: [] });
    const hook = renderHook((nextProps) => useTourRecordingPlaybackSelection(nextProps), props);

    await hook.flush();

    expect(props.setPlayTourRecordingEnabled).toHaveBeenCalledWith(false);
    expect(props.setSelectedTourRecordingId).toHaveBeenCalledWith('');
  });
});
