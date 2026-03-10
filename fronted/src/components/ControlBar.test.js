import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlBar } from './ControlBar';

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

describe('ControlBar', () => {
  test('renders controls and fires key callbacks', () => {
    const onChangeSelectedChat = jest.fn();
    const onChangeGuideEnabled = jest.fn();
    const onChangeGuideDuration = jest.fn();
    const onJump = jest.fn();
    const onReset = jest.fn();

    const view = render(
      <ControlBar
        useAgentMode={false}
        onChangeUseAgentMode={jest.fn()}
        agentOptions={[]}
        selectedAgentId=""
        onChangeSelectedAgentId={jest.fn()}
        chatOptions={['chat-1', 'chat-2']}
        selectedChat="chat-1"
        onChangeSelectedChat={onChangeSelectedChat}
        guideEnabled
        onChangeGuideEnabled={onChangeGuideEnabled}
        guideDuration="10"
        onChangeGuideDuration={onChangeGuideDuration}
        guideStyle="friendly"
        onChangeGuideStyle={jest.fn()}
        tourMeta={{ profiles: ['General'] }}
        tourZone="z1"
        onChangeTourZone={jest.fn()}
        audienceProfile="General"
        onChangeAudienceProfile={jest.fn()}
        groupMode={false}
        onChangeGroupMode={jest.fn()}
        ttsEnabled
        onChangeTtsEnabled={jest.fn()}
        ttsMode="modelscope"
        onChangeTtsMode={jest.fn()}
        ttsSpeed={1}
        onChangeTtsSpeed={jest.fn()}
        continuousTour={false}
        onChangeContinuousTour={jest.fn()}
        tourRecordingEnabled={false}
        onChangeTourRecordingEnabled={jest.fn()}
        playTourRecordingEnabled={false}
        onChangePlayTourRecordingEnabled={jest.fn()}
        tourRecordingOptions={[]}
        selectedTourRecordingId=""
        onChangeSelectedTourRecordingId={jest.fn()}
        onRenameSelectedTourRecording={jest.fn()}
        onDeleteSelectedTourRecording={jest.fn()}
        wakeWordEnabled
        onChangeWakeWordEnabled={jest.fn()}
        wakeWord="hello assistant"
        onChangeWakeWord={jest.fn()}
        wakeWordCooldownMs={3000}
        onChangeWakeWordCooldownMs={jest.fn()}
        wakeWordStrict={false}
        onChangeWakeWordStrict={jest.fn()}
        tourState={{ mode: 'running', stopIndex: 1, stopName: 'Stop B' }}
        currentIntent={{ intent: 'next' }}
        tourStops={['Stop A', 'Stop B']}
        tourSelectedStopIndex={0}
        onChangeTourSelectedStopIndex={jest.fn()}
        onJump={onJump}
        onReset={onReset}
      />
    );

    const chatSelect = view.container.querySelector('.kb-select select');
    chatSelect.value = 'chat-2';
    act(() => {
      chatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChangeSelectedChat).toHaveBeenCalledWith('chat-2');

    const guideToggle = view.container.querySelector('.tts-toggle input[type="checkbox"]');
    act(() => {
      guideToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChangeGuideEnabled).toHaveBeenCalled();

    act(() => {
      view.container.querySelector('.tour-jump-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      view.container.querySelector('.tour-reset-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
