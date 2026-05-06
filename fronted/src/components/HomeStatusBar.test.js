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
  test('shows status fields, empty timeline, and handles select changes', () => {
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
    expect(view.container.textContent).toContain('等待触发');

    view.unmount();
  });

  test('falls back to 无 when ragflow conversation is absent', () => {
    const view = render(<HomeStatusBar ragflowConversationLabel="" />);
    expect(view.container.textContent).toContain('无');
    view.unmount();
  });

  test('renders request timeline using debug timings', () => {
    const view = render(
      <HomeStatusBar
        debugInfo={{
          submitAt: 100,
          ragflowFirstSegmentAt: 260,
          ttsFirstAudioAt: 430,
          ragflowDoneAt: 780,
          ttsAllDoneAt: 1200,
        }}
        serverStatus={{
          derived_ms: {
            ask_client_start_to_client_submit_ms: 1,
            ask_client_start_to_server_receive_ms: -194,
            ask_client_start_to_request_parse_done_ms: -191,
            ask_client_start_to_conversation_resolved_ms: -187,
            ask_client_start_to_orchestrator_ready_ms: -181,
            ask_client_start_to_qa_match_start_ms: -179,
            ask_client_start_to_qa_match_end_ms: 21637,
            ask_client_start_to_server_submit_ms: -180,
            ask_client_start_to_rag_request_ms: -110,
            client_submit_to_server_receive_ms: 2,
            server_receive_to_request_parse_done_ms: 3,
            server_receive_to_conversation_resolved_ms: 7,
            server_receive_to_orchestrator_ready_ms: 13,
            server_receive_to_qa_match_start_ms: 15,
            server_receive_to_qa_match_end_ms: 21,
            server_receive_to_server_submit_ms: 25,
            server_receive_to_rag_request_total_ms: 95,
            server_receive_to_rag_first_chunk_ms: 125,
            server_receive_to_rag_first_text_ms: 175,
            server_receive_to_first_segment_ms: 325,
            server_receive_to_tts_first_audio_ms: 475,
            server_receive_to_rag_done_ms: 620,
            server_receive_to_play_end_ms: 1025,
            rag_request_to_first_chunk_ms: 20,
            submit_to_rag_first_chunk_ms: 45,
            submit_to_rag_first_text_ms: 70,
            submit_to_first_segment_ms: 160,
            submit_to_tts_first_audio_ms: 330,
          },
        }}
      />
    );

    expect(view.container.textContent).toContain('开始');
    expect(view.container.textContent).toContain('0 ms');
    expect(view.container.textContent).toContain('发送');
    expect(view.container.textContent).toContain('2 ms');
    expect(view.container.textContent).toContain('服务端接收');
    expect(view.container.textContent).toContain('0 ms');
    expect(view.container.textContent).toContain('请求解析');
    expect(view.container.textContent).toContain('3 ms');
    expect(view.container.textContent).toContain('会话解析');
    expect(view.container.textContent).toContain('7 ms');
    expect(view.container.textContent).toContain('编排启动');
    expect(view.container.textContent).toContain('13 ms');
    expect(view.container.textContent).toContain('问题比对开始');
    expect(view.container.textContent).toContain('15 ms');
    expect(view.container.textContent).toContain('问题比对完成');
    expect(view.container.textContent).toContain('21 ms');
    expect(view.container.textContent).toContain('服务端提交');
    expect(view.container.textContent).toContain('25 ms');
    expect(view.container.textContent).toContain('RAG 请求');
    expect(view.container.textContent).toContain('95 ms');
    expect(view.container.textContent).toContain('首块');
    expect(view.container.textContent).toContain('125 ms');
    expect(view.container.textContent).toContain('首文本');
    expect(view.container.textContent).toContain('175 ms');
    expect(view.container.textContent).toContain('首分段');
    expect(view.container.textContent).toContain('325 ms');
    expect(view.container.textContent).toContain('首音频');
    expect(view.container.textContent).toContain('475 ms');
    expect(view.container.textContent).toContain('RAG 完成');
    expect(view.container.textContent).toContain('620 ms');
    expect(view.container.textContent).toContain('结束');
    expect(view.container.textContent).toContain('1025 ms');

    view.unmount();
  });

  test('shows disabled audio timing when tts is off', () => {
    const view = render(
      <HomeStatusBar
        ttsEnabled={false}
        debugInfo={{
          submitAt: 100,
          ragflowDoneAt: 300,
        }}
        serverStatus={{
          derived_ms: {
            ask_client_start_to_client_submit_ms: 10,
            ask_client_start_to_server_receive_ms: 15,
            ask_client_start_to_request_parse_done_ms: 18,
            ask_client_start_to_conversation_resolved_ms: 23,
            ask_client_start_to_orchestrator_ready_ms: 26,
            ask_client_start_to_qa_match_start_ms: 27,
            ask_client_start_to_server_submit_ms: 20,
            ask_client_start_to_rag_request_ms: 28,
            rag_request_to_first_chunk_ms: 52,
            submit_to_rag_first_chunk_ms: 60,
          },
        }}
      />
    );

    expect(view.container.textContent).toContain('disabled');
    view.unmount();
  });
});
