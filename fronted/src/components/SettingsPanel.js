import React, { useEffect, useMemo, useState } from 'react';
import { SettingsDrawer } from './SettingsDrawer';
import { SettingsToggles } from './SettingsToggles';
import { StagePanel } from './StagePanel';
import { TourModePanel } from './TourModePanel';
import { QaAudioCachePanel } from './QaAudioCachePanel';
import { RecordingArchivePreviewPanel } from './RecordingArchivePreviewPanel';
import { fetchRagflowConfig, saveRagflowConfig } from '../api/backendClient';

const TABS = [
  { key: 'tts', label: '语音合成设置' },
  { key: 'debug', label: '调试设置' },
  { key: 'ops', label: '运维设置' },
  { key: 'qa', label: '问答缓存' },
  { key: 'archive', label: '存档设置' },
  { key: 'asr', label: '语音识别设置' },
  { key: 'mode', label: '讲解设置' },
  { key: 'stop_prompt', label: '站点提示词' },
  { key: 'template', label: '模板编辑' },
];
const DEFAULT_SETTINGS_TAB = 'tts';
const MODELSCOPE_VOICE_OPTIONS = [
  'longxiaochun',
  'longfeicheng',
  'longhua',
  'longxiaoxia_v2',
  'longxiaocheng',
  'longlaotie',
  'longwan',
  'longcheng',
  'longhua_v2',
  'loongbella',
  'loongstella',
  'loongwilliam',
  'longcheng_v2',
  'loongsamuel',
];
const FLASH_VOICE_OPTIONS = ['longanyang', 'longanhuan'];
const LEGACY_FALLBACK_STOPS = new Set([
  'company_overview',
  'core_products',
  'orthopedics',
  'urology',
  'other_products_and_scenarios',
  'summary_and_qa',
]);

function normalizeStopNameList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function stripLegacyFallbackStops(stops) {
  const list = normalizeStopNameList(stops);
  if (!list.length) return [];
  const hasBusinessStops = list.some((name) => !LEGACY_FALLBACK_STOPS.has(name));
  if (!hasBusinessStops) return list;
  return list.filter((name) => !LEGACY_FALLBACK_STOPS.has(name));
}

function normalizeSettingsTabKey(value) {
  const key = String(value || '').trim();
  return TABS.some((tab) => tab.key === key) ? key : DEFAULT_SETTINGS_TAB;
}

function getOfficialTtsVoiceOptions(mode) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode === 'flash') return FLASH_VOICE_OPTIONS;
  if (normalizedMode === 'modelscope') return MODELSCOPE_VOICE_OPTIONS;
  return [];
}

function SettingsGroup({ title, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{title}</div>
      <div className="settings-group-body">{children}</div>
    </div>
  );
}

function normalizeStopPromptMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    const stopName = String(key || '').trim();
    if (!stopName) return;
    const text = String(value[key] == null ? '' : value[key]).trim();
    if (!text) return;
    out[stopName] = text;
  });
  return out;
}

function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="设置标签页">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`settings-tab-btn${activeTab === tab.key ? ' is-active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TtsTab({ controlBarProps, ttsMode, modelscopeVoice, onChangeModelscopeVoice, ttsFetchConcurrency, onChangeTtsFetchConcurrency }) {
  const c = controlBarProps || {};
  const activeTtsMode = String(ttsMode || c.ttsMode || '').trim().toLowerCase();
  const officialVoiceOptions = useMemo(() => getOfficialTtsVoiceOptions(activeTtsMode), [activeTtsMode]);
  const currentVoiceValue = String(modelscopeVoice || '').trim();
  const voiceOptions = useMemo(() => {
    if (!currentVoiceValue) return officialVoiceOptions;
    if (officialVoiceOptions.includes(currentVoiceValue)) return officialVoiceOptions;
    return [currentVoiceValue, ...officialVoiceOptions];
  }, [currentVoiceValue, officialVoiceOptions]);
  return (
    <>
      <SettingsGroup title="语音开关">
        <div className="settings-section">
          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.ttsEnabled} onChange={(e) => c.onChangeTtsEnabled && c.onChangeTtsEnabled(e.target.checked)} />
            <span>启用TTS播报</span>
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="语音参数">
        <div className="settings-form">
          <label className="settings-field">
            <span>TTS提供方</span>
            <select value={String(c.ttsMode || 'modelscope')} onChange={(e) => c.onChangeTtsMode && c.onChangeTtsMode(e.target.value)}>
              <option value="sovtts1">SOVTTS1</option>
              <option value="sovtts2">SOVTTS2</option>
              <option value="modelscope">ModelScope</option>
              <option value="flash">Flash(cosyvoice-v3-flash)</option>
              <option value="sapi">SAPI</option>
              <option value="edge">Edge</option>
            </select>
          </label>

          <label className="settings-field">
            <span>语速</span>
            <select value={String(c.ttsSpeed || 1.0)} onChange={(e) => c.onChangeTtsSpeed && c.onChangeTtsSpeed(Number(e.target.value) || 1.0)}>
              <option value="1">标准(1.0x)</option>
              <option value="1.25">加速(1.25x)</option>
              <option value="1.5">更快(1.5x)</option>
            </select>
          </label>

          <label className="settings-field">
            <span>TTS并发数</span>
            <select value={String(ttsFetchConcurrency || 4)} onChange={(e) => onChangeTtsFetchConcurrency && onChangeTtsFetchConcurrency(Number(e.target.value) || 4)}>
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="6">6</option>
              <option value="8">8</option>
              <option value="10">10</option>
            </select>
          </label>

          {(activeTtsMode === 'modelscope' || activeTtsMode === 'flash') ? (
            <label className="settings-field">
              <span>{activeTtsMode === 'flash' ? 'Flash voice id' : 'ModelScope voice id'}</span>
              <select value={currentVoiceValue} onChange={(e) => onChangeModelscopeVoice && onChangeModelscopeVoice(e.target.value)}>
                <option value="">Select voice id</option>
                {voiceOptions.map((voiceId) => (
                  <option key={voiceId} value={voiceId}>
                    {voiceId}
                    {voiceId === currentVoiceValue && !officialVoiceOptions.includes(voiceId) ? ' (current custom)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </SettingsGroup>
    </>
  );
}

function DebugTab({
  showHistoryPanel,
  onChangeShowHistoryPanel,
  showDebugPanel,
  onChangeShowDebugPanel,
  controlBarProps,
  onClearExhibitChatSessions,
  ragflowStatusLabel,
  ragflowStatusDetail,
}) {
  const c = controlBarProps || {};
  const stateText =
    c.tourState && c.tourState.mode
      ? `${c.tourState.mode}${Number.isFinite(c.tourState.stopIndex) ? ` / \u7b2c${Number(c.tourState.stopIndex) + 1}\u7ad9` : ''}`
      : 'unknown';
  const ragLabel = String(ragflowStatusLabel || '\u68c0\u6d4b\u4e2d').trim() || '\u68c0\u6d4b\u4e2d';
  const ragTone =
    ragLabel === '\u5df2\u8fde\u63a5' ? 'settings-status-ok' : ragLabel === '\u672a\u8fde\u63a5' ? 'settings-status-error' : 'settings-status-pending';
  const ragDetail = String(ragflowStatusDetail || '').trim();

  return (
    <>
      <SettingsGroup title={'\u9762\u677f\u5f00\u5173'}>
        <SettingsToggles
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={onChangeShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={onChangeShowDebugPanel}
        />
      </SettingsGroup>
      <SettingsGroup title={'\u72b6\u6001\u5feb\u7167'}>
        <div className="settings-form">
          <div className="settings-field">
            <span>{'\u8bb2\u89e3\u72b6\u6001\u673a'}</span>
            <div>{stateText}</div>
          </div>
          <div className="settings-field">
            <span>{'\u5f53\u524d\u610f\u56fe'}</span>
            <div>{(c.currentIntent && c.currentIntent.intent) || 'none'}</div>
          </div>
          <div className="settings-field">
            <span>{'RAGFlow \u8fde\u63a5'}</span>
            <div className={`settings-status-text ${ragTone}`}>{ragLabel}</div>
          </div>
          {ragDetail ? (
            <div className="settings-field">
              <span>{'RAGFlow \u8be6\u60c5'}</span>
              <div className="settings-status-detail" title={ragDetail}>
                {ragDetail}
              </div>
            </div>
          ) : null}
        </div>
      </SettingsGroup>
      <SettingsGroup title="Session">
        <div className="settings-actions">
          <button type="button" className="settings-action-btn settings-action-btn-danger" onClick={onClearExhibitChatSessions}>
            {'\u5220\u9664\u5c55\u5385\u804a\u5929\u6240\u6709 session'}
          </button>
        </div>
      </SettingsGroup>
    </>
  );
}

function OpsTab({ stagePanelProps, onQuickSummary, onPrevStop, onNextStop }) {
  const [ragflowApiKey, setRagflowApiKey] = useState('');
  const [ragflowLoading, setRagflowLoading] = useState(true);
  const [ragflowSaving, setRagflowSaving] = useState(false);
  const [ragflowError, setRagflowError] = useState('');
  const [ragflowMessage, setRagflowMessage] = useState('');

  useEffect(() => {
    let disposed = false;
    const loadRagflowConfig = async () => {
      setRagflowLoading(true);
      setRagflowError('');
      setRagflowMessage('');
      try {
        const payload = await fetchRagflowConfig();
        if (disposed) return;
        const nextApiKey = String(payload && payload.config && payload.config.api_key ? payload.config.api_key : '');
        setRagflowApiKey(nextApiKey);
      } catch (e) {
        if (disposed) return;
        setRagflowError(String((e && e.message) || e || 'load_failed'));
      } finally {
        if (disposed) return;
        setRagflowLoading(false);
      }
    };
    loadRagflowConfig();
    return () => {
      disposed = true;
    };
  }, []);

  const onSaveRagflowApiKey = async () => {
    if (ragflowSaving) return;
    setRagflowSaving(true);
    setRagflowError('');
    setRagflowMessage('');
    try {
      const payload = await saveRagflowConfig({ apiKey: ragflowApiKey });
      const savedApiKey = String(payload && payload.config && payload.config.api_key ? payload.config.api_key : ragflowApiKey);
      setRagflowApiKey(savedApiKey);
      setRagflowMessage('RAGFlow API Key 已保存');
    } catch (e) {
      setRagflowError(String((e && e.message) || e || 'save_failed'));
    } finally {
      setRagflowSaving(false);
    }
  };

  return (
    <SettingsGroup title="运维动作">
      <StagePanel {...(stagePanelProps || {})} />
      <div className="settings-divider" />
      <div className="settings-actions">
        <button type="button" className="settings-action-btn" onClick={onQuickSummary}>
          30秒总结
        </button>
        <button type="button" className="settings-action-btn" onClick={onPrevStop}>
          上一站
        </button>
        <button type="button" className="settings-action-btn" onClick={onNextStop}>
          下一站
        </button>
      </div>
      <div className="settings-divider" />
      <div className="settings-form">
        <label className="settings-field">
          <span>RAGFlow API Key</span>
          <input
            type="text"
            value={ragflowApiKey}
            onChange={(e) => setRagflowApiKey(e.target.value)}
            placeholder="ragflow-..."
            autoComplete="off"
          />
        </label>
      </div>
      <div className="settings-actions">
        <button
          type="button"
          className="settings-action-btn settings-action-btn-primary"
          onClick={onSaveRagflowApiKey}
          disabled={ragflowLoading || ragflowSaving}
        >
          {ragflowSaving ? '保存中...' : '保存 RAGFlow Key'}
        </button>
      </div>
      {ragflowLoading ? <div className="debug-muted">正在读取当前 key...</div> : null}
      {ragflowMessage ? <div style={{ color: '#166534', fontSize: 12 }}>{ragflowMessage}</div> : null}
      {ragflowError ? <div style={{ color: '#b91c1c', fontSize: 12 }}>{ragflowError}</div> : null}
    </SettingsGroup>
  );
}

function QaTab({ controlBarProps }) {
  const c = controlBarProps || {};
  return (
    <>
      <SettingsGroup title="问答配置">
        <div className="settings-form">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.qaAudioCacheLookupEnabled}
              onChange={(e) => c.onChangeQaAudioCacheLookupEnabled && c.onChangeQaAudioCacheLookupEnabled(e.target.checked)}
            />
            <span>开启问答缓存命中（关闭后仅写入不读取）</span>
          </label>
          <label className="settings-field">
            <span>问答回答字数</span>
            <input
              type="number"
              min="1"
              step="1"
              value={String(c.qaAnswerTargetChars || '10')}
              onChange={(e) => c.onChangeQaAnswerTargetChars && c.onChangeQaAnswerTargetChars(e.target.value)}
              placeholder="最小1"
            />
          </label>
          <label className="settings-field">
            <span>缓存置信度阈值</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={String(c.qaAudioCacheConfidenceThreshold || '0.85')}
              onChange={(e) => c.onChangeQaAudioCacheConfidenceThreshold && c.onChangeQaAudioCacheConfidenceThreshold(e.target.value)}
              placeholder="0~1"
            />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="问答语音缓存管理">
        <QaAudioCachePanel />
      </SettingsGroup>
    </>
  );
}

function ArchiveTab({ controlBarProps, ttsMode, modelscopeVoice }) {
  const c = controlBarProps || {};
  const resolvedProvider = String(c.ttsMode || ttsMode || '').trim();
  const resolvedVoice =
    resolvedProvider.toLowerCase() === 'modelscope' || resolvedProvider.toLowerCase() === 'flash' ? String(modelscopeVoice || '').trim() : '';
  const resolvedSpeed = Number(c.ttsSpeed);
  const selectedRecording = Array.isArray(c.tourRecordingOptions)
    ? c.tourRecordingOptions.find((item) => String(item && item.recording_id) === String(c.selectedTourRecordingId || ''))
    : null;
  const selectedMeta = selectedRecording && selectedRecording.metadata && typeof selectedRecording.metadata === 'object' ? selectedRecording.metadata : {};
  const formatSpeed = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return `${n.toFixed(2)}x`;
  };

  return (
    <>
      <SettingsGroup title="录制与回放">
        <div className="settings-form">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.tourRecordingEnabled}
              onChange={(e) => c.onChangeTourRecordingEnabled && c.onChangeTourRecordingEnabled(e.target.checked)}
              disabled={!c.guideEnabled}
            />
            <span>录制讲解</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.playTourRecordingEnabled}
              onChange={(e) => c.onChangePlayTourRecordingEnabled && c.onChangePlayTourRecordingEnabled(e.target.checked)}
              disabled={!c.guideEnabled}
            />
            <span>播放存档</span>
          </label>

          {c.playTourRecordingEnabled ? (
            <label className="settings-field">
              <span>选择存档</span>
              <select value={String(c.selectedTourRecordingId || '')} onChange={(e) => c.onChangeSelectedTourRecordingId && c.onChangeSelectedTourRecordingId(e.target.value)}>
                <option value="">请选择</option>
                {(c.tourRecordingOptions || []).map((r) => (
                  <option key={String(r.recording_id)} value={String(r.recording_id)}>
                    {r.label || String(r.recording_id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {c.playTourRecordingEnabled && selectedRecording ? (
            <div className="settings-recording-meta">
              <div className="settings-recording-meta-title">存档详情</div>
              <div className="settings-recording-meta-grid">
                <div className="settings-recording-meta-item">
                  <span>编号</span>
                  <strong>{String(selectedRecording.recording_id || '')}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>Provider</span>
                  <strong>{String(selectedMeta.tts_provider || '--')}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>Voice</span>
                  <strong>{String(selectedMeta.tts_voice || '--')}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>原始音频</span>
                  <strong>{formatSpeed(selectedMeta.stored_audio_speed)}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>录制时播放</span>
                  <strong>{formatSpeed(selectedMeta.record_playback_speed)}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>当前播放</span>
                  <strong>{formatSpeed(resolvedSpeed)}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>创建时间</span>
                  <strong>{String(selectedRecording.created_at_label || '--')}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>结束时间</span>
                  <strong>{String(selectedRecording.finished_at_label || '--')}</strong>
                </div>
                <div className="settings-recording-meta-item">
                  <span>站点数</span>
                  <strong>{Number(selectedRecording.stop_count || 0)}</strong>
                </div>
              </div>
            </div>
          ) : null}

          {c.playTourRecordingEnabled ? (
            <div className="settings-actions">
              <button type="button" className="settings-action-btn" onClick={() => c.onRenameSelectedTourRecording && c.onRenameSelectedTourRecording()}>
                重命名
              </button>
              <button type="button" className="settings-action-btn" onClick={() => c.onDeleteSelectedTourRecording && c.onDeleteSelectedTourRecording()}>
                删除
              </button>
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      {c.playTourRecordingEnabled ? (
        <SettingsGroup title="存档文字与语音预览">
          <RecordingArchivePreviewPanel
            recordingId={String(c.selectedTourRecordingId || '')}
            ttsProvider={resolvedProvider}
            ttsVoice={resolvedVoice}
            ttsSpeed={Number.isFinite(resolvedSpeed) ? resolvedSpeed : 1.0}
          />
        </SettingsGroup>
      ) : null}
    </>
  );
}
function AsrTab({ controlBarProps }) {
  const c = controlBarProps || {};
  const recognitionStageLabel =
    c.asrRecognitionStage === 'capturing'
      ? '正在采集语音'
      : c.asrRecognitionStage === 'waiting_min_duration'
        ? '等待达到最短录音时长'
        : c.asrRecognitionStage === 'awaiting_final'
          ? '等待最终识别结果'
          : c.asrRecognitionStage === 'receiving_partial'
            ? '正在接收中间结果'
            : c.asrRecognitionStage === 'wake_detected'
              ? '已检测到唤醒词'
              : c.asrRecognitionStage === 'streaming'
                ? '正在发送到语音识别服务'
                : c.asrRecognitionStage === 'final_received'
                  ? '已收到最终结果'
                  : c.asrRecognitionStage === 'final_timeout'
                    ? '等待最终结果超时'
                    : c.asrRecognitionStage === 'error'
                      ? '识别出错'
                      : '空闲';
  const postProcessStageLabel =
    c.asrPostProcessStage === 'filtering'
      ? '正在过滤和纠错'
      : c.asrPostProcessStage === 'wake_word_missing'
        ? '未命中唤醒词'
        : c.asrPostProcessStage === 'wake_word_only'
          ? '只有唤醒词'
          : c.asrPostProcessStage === 'accepted'
            ? '已通过'
            : c.asrPostProcessStage === 'bypass_non_asr'
              ? '手动输入，跳过后处理'
              : c.asrPostProcessStage === 'pending_asr_matched'
                ? '已匹配待处理语音识别文本'
                : '空闲';
  const postProcessEvents = Array.isArray(c.asrPostProcessEvents) ? c.asrPostProcessEvents : [];

  return (
    <>
      <SettingsGroup title="语音识别运行状态">
        <div className="settings-form">
          <label className="settings-field">
            <span>语音识别提供方</span>
            <select value={String(c.asrProviderType || 'voicekit_ws')} onChange={(e) => c.onChangeAsrProviderType && c.onChangeAsrProviderType(e.target.value)}>
              <option value="voicekit_ws">VoiceKit WebSocket</option>
              <option value="sauc_ws">SAUC WebSocket (Proxy)</option>
            </select>
          </label>

          {String(c.asrProviderType || 'voicekit_ws') === 'sauc_ws' ? (
            <>
              <label className="settings-field">
                <span>SAUC URL</span>
                <input
                  value={String(c.saucWsUrl || '')}
                  onChange={(e) => c.onChangeSaucWsUrl && c.onChangeSaucWsUrl(e.target.value)}
                  placeholder="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
                />
              </label>

              <label className="settings-field">
                <span>资源 ID</span>
                <input
                  value={String(c.saucResourceId || '')}
                  onChange={(e) => c.onChangeSaucResourceId && c.onChangeSaucResourceId(e.target.value)}
                  placeholder="volc.bigasr.sauc.duration"
                />
              </label>

              <label className="settings-field">
                <span>App Key</span>
                <input
                  value={String(c.saucAppKey || '')}
                  onChange={(e) => c.onChangeSaucAppKey && c.onChangeSaucAppKey(e.target.value)}
                  placeholder="必填"
                />
              </label>

              <label className="settings-field">
                <span>Access Key</span>
                <input
                  value={String(c.saucAccessKey || '')}
                  onChange={(e) => c.onChangeSaucAccessKey && c.onChangeSaucAccessKey(e.target.value)}
                  placeholder="必填"
                />
              </label>

              <label className="settings-field">
                <span>模型名称</span>
                <input
                  value={String(c.saucModelName || 'bigmodel')}
                  onChange={(e) => c.onChangeSaucModelName && c.onChangeSaucModelName(e.target.value)}
                  placeholder="bigmodel"
                />
              </label>

              <label className="settings-field">
                <span>分包时长（毫秒）</span>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="10"
                  value={String(c.saucSegmentDurationMs || 200)}
                  onChange={(e) => c.onChangeSaucSegmentDurationMs && c.onChangeSaucSegmentDurationMs(Number(e.target.value) || 200)}
                  placeholder="200"
                />
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={!!c.saucEnableItn}
                  onChange={(e) => c.onChangeSaucEnableItn && c.onChangeSaucEnableItn(e.target.checked)}
                />
                <span>SAUC 启用 ITN</span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={!!c.saucEnablePunc}
                  onChange={(e) => c.onChangeSaucEnablePunc && c.onChangeSaucEnablePunc(e.target.checked)}
                />
                <span>SAUC 启用标点</span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={!!c.saucEnableDdc}
                  onChange={(e) => c.onChangeSaucEnableDdc && c.onChangeSaucEnableDdc(e.target.checked)}
                />
                <span>SAUC 启用 DDC</span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={!!c.saucShowUtterances}
                  onChange={(e) => c.onChangeSaucShowUtterances && c.onChangeSaucShowUtterances(e.target.checked)}
                />
                <span>SAUC 显示分句</span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={!!c.saucEnableNonstream}
                  onChange={(e) => c.onChangeSaucEnableNonstream && c.onChangeSaucEnableNonstream(e.target.checked)}
                />
                <span>SAUC 启用非流式</span>
              </label>
            </>
          ) : null}

          <div className="settings-field">
            <span>识别阶段</span>
            <div>{recognitionStageLabel}</div>
          </div>

          <div className="settings-field">
            <span>后处理阶段</span>
            <div>{postProcessStageLabel}</div>
          </div>

          <label className="settings-toggle">
            <input type="checkbox" checked={!!c.wakeWordEnabled} onChange={(e) => c.onChangeWakeWordEnabled && c.onChangeWakeWordEnabled(e.target.checked)} />
            <span>启用唤醒词</span>
          </label>

          {c.wakeWordEnabled ? (
            <label className="settings-field">
              <span>唤醒词</span>
              <input value={String(c.wakeWord || '')} onChange={(e) => c.onChangeWakeWord && c.onChangeWakeWord(e.target.value)} placeholder="例如：你好小助手" />
            </label>
          ) : null}

          {c.wakeWordEnabled ? (
            <label className="settings-field">
              <span>唤醒冷却时间（毫秒）</span>
              <input
                type="number"
                min="0"
                step="100"
                value={String(c.wakeWordCooldownMs || 0)}
                onChange={(e) => c.onChangeWakeWordCooldownMs && c.onChangeWakeWordCooldownMs(Number(e.target.value) || 0)}
                placeholder="5000"
              />
            </label>
          ) : null}

          {c.wakeWordEnabled ? (
            <label className="settings-toggle">
              <input type="checkbox" checked={!!c.wakeWordStrict} onChange={(e) => c.onChangeWakeWordStrict && c.onChangeWakeWordStrict(e.target.checked)} />
              <span>严格唤醒词匹配</span>
            </label>
          ) : null}

          <label className="settings-field">
            <span>静音判定时长（毫秒）</span>
            <input
              type="number"
              min="500"
              max="3000"
              step="100"
              value={String(c.asrConversationAutoSubmitSilenceMs || 1200)}
              onChange={(e) =>
                c.onChangeAsrConversationAutoSubmitSilenceMs &&
                c.onChangeAsrConversationAutoSubmitSilenceMs(Number(e.target.value) || 1200)
              }
              placeholder="1200"
            />
          </label>

          <label className="settings-field">
            <span>上下文策略</span>
            <select
              value={String(c.asrConversationContextStrategy || 'smart_recent_current')}
              onChange={(e) => c.onChangeAsrConversationContextStrategy && c.onChangeAsrConversationContextStrategy(e.target.value)}
            >
              <option value="smart_recent_current">摘要 + 最近轮次 + 当前问题</option>
              <option value="full">全量历史</option>
            </select>
          </label>

          {String(c.asrConversationContextStrategy || 'smart_recent_current') === 'smart_recent_current' ? (
            <>
              <label className="settings-field">
                <span>最近轮次数</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={String(c.asrConversationContextRecentTurns || 10)}
                  onChange={(e) =>
                    c.onChangeAsrConversationContextRecentTurns &&
                    c.onChangeAsrConversationContextRecentTurns(Number(e.target.value) || 10)
                  }
                  placeholder="10"
                />
              </label>
              <label className="settings-field">
                <span>上下文 Token 上限</span>
                <input
                  type="number"
                  min="2000"
                  max="64000"
                  step="500"
                  value={String(c.asrConversationContextMaxTokens || 16000)}
                  onChange={(e) =>
                    c.onChangeAsrConversationContextMaxTokens &&
                    c.onChangeAsrConversationContextMaxTokens(Number(e.target.value) || 16000)
                  }
                  placeholder="16000"
                />
              </label>
            </>
          ) : null}

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.asrAutoResumeAfterAnswerEnabled}
              onChange={(e) =>
                c.onChangeAsrAutoResumeAfterAnswerEnabled && c.onChangeAsrAutoResumeAfterAnswerEnabled(e.target.checked)
              }
            />
            <span>回答后自动恢复讲解</span>
          </label>

          {c.asrAutoResumeAfterAnswerEnabled ? (
            <label className="settings-field">
              <span>恢复等待时间（毫秒）</span>
              <input
                type="number"
                min="300"
                max="20000"
                step="100"
                value={String(c.asrAutoResumeAfterAnswerDelayMs || 2200)}
                onChange={(e) =>
                  c.onChangeAsrAutoResumeAfterAnswerDelayMs &&
                  c.onChangeAsrAutoResumeAfterAnswerDelayMs(Number(e.target.value) || 2200)
                }
                placeholder="2200"
              />
            </label>
          ) : null}

          <label className="settings-field">
            <span>最短录音时长（毫秒）</span>
            <input
              type="number"
              min="200"
              step="50"
              value={String(c.asrMinRecordMs || 900)}
              onChange={(e) => c.onChangeAsrMinRecordMs && c.onChangeAsrMinRecordMs(Number(e.target.value) || 0)}
              placeholder="900"
            />
          </label>

          <label className="settings-field">
            <span>停止缓冲时长（毫秒）</span>
            <input
              type="number"
              min="0"
              step="20"
              value={String(c.asrStopGraceMs || 480)}
              onChange={(e) => c.onChangeAsrStopGraceMs && c.onChangeAsrStopGraceMs(Number(e.target.value) || 0)}
              placeholder="480"
            />
          </label>

          <label className="settings-field">
            <span>等待最终结果超时（毫秒）</span>
            <input
              type="number"
              min="200"
              step="50"
              value={String(c.asrFinalWaitMs || 1500)}
              onChange={(e) => c.onChangeAsrFinalWaitMs && c.onChangeAsrFinalWaitMs(Number(e.target.value) || 0)}
              placeholder="1500"
            />
          </label>

          <label className="settings-field">
            <span>最终结果超时策略</span>
            <select
              value={String(c.asrFinalTimeoutStrategy || 'keep_partial')}
              onChange={(e) => c.onChangeAsrFinalTimeoutStrategy && c.onChangeAsrFinalTimeoutStrategy(e.target.value)}
            >
              <option value="keep_partial">保留中间识别文本</option>
              <option value="keep_input">保留当前输入框内容</option>
              <option value="clear_input">恢复识别前输入内容</option>
            </select>
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="语音识别文本过滤">
        <div className="settings-form">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={!!c.asrTextFilterEnabled}
              onChange={(e) => c.onChangeAsrTextFilterEnabled && c.onChangeAsrTextFilterEnabled(e.target.checked)}
            />
            <span>启用基于 RAG 的纠错</span>
          </label>

          {c.asrTextFilterEnabled ? (
            <label className="settings-field">
              <span>RAGFlow 对话名称</span>
              <input
                value={String(c.asrTextFilterChatName || '')}
                onChange={(e) => c.onChangeAsrTextFilterChatName && c.onChangeAsrTextFilterChatName(e.target.value)}
                placeholder="例如：语音问答"
              />
            </label>
          ) : null}

          {c.asrTextFilterEnabled ? (
            <label className="settings-field">
              <span>领域术语</span>
              <textarea
                className="settings-textarea"
                rows={2}
                value={String(c.asrTextFilterTerms || '')}
                onChange={(e) => c.onChangeAsrTextFilterTerms && c.onChangeAsrTextFilterTerms(e.target.value)}
                placeholder="指引导丝，指引导管"
              />
            </label>
          ) : null}

          {c.asrTextFilterEnabled ? (
            <label className="settings-field">
              <span>纠错提示词</span>
              <textarea
                className="settings-textarea"
                rows={14}
                value={String(c.asrTextFilterPrompt || '')}
                onChange={(e) => c.onChangeAsrTextFilterPrompt && c.onChangeAsrTextFilterPrompt(e.target.value)}
                placeholder="填写发送到 RAGFlow 纠错对话前使用的提示词。"
              />
              <span className="settings-field-hint">这段提示词会先用于语音识别纠错，再进行唤醒词判断和业务提交。</span>
            </label>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup title="语音识别事件日志">
        <div className="settings-form">
          <div className="settings-field">
            <span>最近后处理事件</span>
            <div>
              {postProcessEvents.length ? (
                postProcessEvents.map((event, idx) => {
                  const fields = event && event.fields && typeof event.fields === 'object' ? event.fields : {};
                  const text = fields.text || fields.correctedText || fields.trigger || '';
                  return (
                    <div key={`${String(event && event.name) || 'evt'}_${idx}`}>
                      {String(event && event.name) || '事件'}
                      {text ? `: ${String(text)}` : ''}
                    </div>
                  );
                })
              ) : (
                <div>暂时没有后处理事件。</div>
              )}
            </div>
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

function ModeTab({ controlBarProps }) {
  const c = controlBarProps || {};
  const profiles = (c.tourMeta && Array.isArray(c.tourMeta.profiles) ? c.tourMeta.profiles : []).map((x) => String(x || '').trim()).filter(Boolean);
  const guideEnabled = !!c.guideEnabled;
  const onChangeGuideEnabled = c.onChangeGuideEnabled;

  useEffect(() => {
    if (!guideEnabled && typeof onChangeGuideEnabled === 'function') {
      onChangeGuideEnabled(true);
    }
  }, [guideEnabled, onChangeGuideEnabled]);

  return (
    <SettingsGroup title="讲解设置">
      <div className="settings-form">
        <label className="settings-toggle">
          <input type="checkbox" checked={!!c.continuousTour} onChange={(e) => c.onChangeContinuousTour && c.onChangeContinuousTour(e.target.checked)} />
          <span>连续讲解</span>
        </label>

        {profiles.length ? (
          <label className="settings-field">
            <span>人群画像</span>
            <select value={String(c.audienceProfile || '')} onChange={(e) => c.onChangeAudienceProfile && c.onChangeAudienceProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="settings-field">
          <span>全局前置提示词</span>
          <textarea
            className="settings-textarea"
            rows={4}
            value={String(c.globalPromptPrefix || '')}
            onChange={(e) => c.onChangeGlobalPromptPrefix && c.onChangeGlobalPromptPrefix(e.target.value)}
            placeholder="例如：这是一份展厅讲解稿撰写任务，不是导航或指路请求。请生成用于语音播报的讲解稿正文，不要提供任何路线指引。"
          />
          <span className="settings-field-hint">该提示词会附加到所有展厅提示词的最前面，用于覆盖系统默认的导航意图</span>
        </label>
      </div>
    </SettingsGroup>
  );
}
function StopPromptTab({ controlBarProps }) {
  const c = controlBarProps || {};
  const savedPromptMap = useMemo(() => {
    return normalizeStopPromptMap(c.tourStopPromptOverrides);
  }, [c.tourStopPromptOverrides]);
  const [draftPromptMap, setDraftPromptMap] = useState(savedPromptMap);
  const savedPromptMapSignature = useMemo(() => JSON.stringify(savedPromptMap || {}), [savedPromptMap]);

  useEffect(() => {
    setDraftPromptMap(savedPromptMap);
  }, [savedPromptMap, savedPromptMapSignature]);

  const mergedStopsRaw = [];
  const pushStop = (name) => {
    const s = String(name || '').trim();
    if (!s) return;
    if (mergedStopsRaw.includes(s)) return;
    mergedStopsRaw.push(s);
  };

  (Array.isArray(c.tourStopsOverride) ? c.tourStopsOverride : []).forEach(pushStop);
  (Array.isArray(c.tourStops) ? c.tourStops : []).forEach(pushStop);
  Object.keys(draftPromptMap || {}).forEach(pushStop);
  const mergedStops = stripLegacyFallbackStops(mergedStopsRaw);

  const onSave = () => {
    const normalized = normalizeStopPromptMap(draftPromptMap);
    const visibleStops = new Set(mergedStops);
    const sanitized = {};
    Object.keys(normalized).forEach((stopName) => {
      if (!visibleStops.has(stopName)) return;
      sanitized[stopName] = normalized[stopName];
    });
    if (typeof c.onSaveTourStopPromptOverrides === 'function') {
      c.onSaveTourStopPromptOverrides(sanitized);
      return;
    }
    if (typeof c.onClearTourStopPromptOverrides === 'function') c.onClearTourStopPromptOverrides();
    if (typeof c.onChangeTourStopPromptOverride === 'function') {
      Object.keys(sanitized || {}).forEach((stopName) => {
        c.onChangeTourStopPromptOverride(stopName, sanitized[stopName]);
      });
    }
  };

  const onClear = () => {
    const confirmed = window.confirm('确认清除全部站点提示词吗？');
    if (!confirmed) return;
    setDraftPromptMap({});
    if (typeof c.onSaveTourStopPromptOverrides === 'function') {
      c.onSaveTourStopPromptOverrides({});
      return;
    }
    if (typeof c.onClearTourStopPromptOverrides === 'function') c.onClearTourStopPromptOverrides();
  };

  return (
    <SettingsGroup title="按站点配置附加提示词">
      <div className="settings-actions" style={{ marginBottom: 10 }}>
        <button type="button" className="settings-action-btn settings-action-btn-danger" onClick={onClear}>
          清除
        </button>
        <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={onSave}>
          保存
        </button>
      </div>

      {!mergedStops.length ? <div className="debug-muted">当前没有可配置的站点，请先加载讲解路线或模板。</div> : null}

      <div className="settings-form">
        {mergedStops.map((stopName) => (
          <label className="settings-field" key={stopName}>
            <span>{stopName}</span>
            <textarea
              className="settings-textarea"
              rows={3}
              value={String(draftPromptMap[stopName] || '')}
              onChange={(e) => {
                const nextValue = e.target.value;
                setDraftPromptMap((prev) => {
                  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
                  return { ...base, [stopName]: nextValue };
                });
              }}
              placeholder="该站点讲解时会附加到提示词中，例如：重点突出某产品、避免某类表述、必须包含某信息。"
            />
          </label>
        ))}
      </div>
    </SettingsGroup>
  );
}

function TemplateTab({ tourModePanelProps }) {
  return (
    <SettingsGroup title="模板编辑">
      <TourModePanel {...(tourModePanelProps || {})} />
    </SettingsGroup>
  );
}

export function SettingsPanel({
  open,
  onClose,
  docked,
  showHistoryPanel,
  onChangeShowHistoryPanel,
  showDebugPanel,
  onChangeShowDebugPanel,
  controlBarProps,
  stagePanelProps,
  tourModePanelProps,
  ttsMode,
  modelscopeVoice,
  onChangeModelscopeVoice,
  ttsFetchConcurrency,
  onChangeTtsFetchConcurrency,
  groupMode,
  speakerName,
  onChangeSpeakerName,
  questionPriority,
  onChangeQuestionPriority,
  onQuickSummary,
  onPrevStop,
  onNextStop,
  onClearExhibitChatSessions,
  activeTab,
  onChangeActiveTab,
  ragflowStatusLabel,
  ragflowStatusDetail,
}) {
  void [groupMode, speakerName, onChangeSpeakerName, questionPriority, onChangeQuestionPriority];
  const resolvedActiveTab = normalizeSettingsTabKey(activeTab);

  const onTabChange = (nextTab) => {
    if (typeof onChangeActiveTab === 'function') onChangeActiveTab(normalizeSettingsTabKey(nextTab));
  };

  const tabContent = useMemo(() => {
    if (resolvedActiveTab === 'tts') {
      return (
        <TtsTab
          controlBarProps={controlBarProps}
          ttsMode={ttsMode}
          modelscopeVoice={modelscopeVoice}
          onChangeModelscopeVoice={onChangeModelscopeVoice}
          ttsFetchConcurrency={ttsFetchConcurrency}
          onChangeTtsFetchConcurrency={onChangeTtsFetchConcurrency}
        />
      );
    }
    if (resolvedActiveTab === 'debug') {
      return (
        <DebugTab
          showHistoryPanel={showHistoryPanel}
          onChangeShowHistoryPanel={onChangeShowHistoryPanel}
          showDebugPanel={showDebugPanel}
          onChangeShowDebugPanel={onChangeShowDebugPanel}
          controlBarProps={controlBarProps}
          onClearExhibitChatSessions={onClearExhibitChatSessions}
          ragflowStatusLabel={ragflowStatusLabel}
          ragflowStatusDetail={ragflowStatusDetail}
        />
      );
    }
    if (resolvedActiveTab === 'ops') {
      return <OpsTab stagePanelProps={stagePanelProps} onQuickSummary={onQuickSummary} onPrevStop={onPrevStop} onNextStop={onNextStop} />;
    }
    if (resolvedActiveTab === 'qa') {
      return <QaTab controlBarProps={controlBarProps} />;
    }
    if (resolvedActiveTab === 'archive') {
      return <ArchiveTab controlBarProps={controlBarProps} ttsMode={ttsMode} modelscopeVoice={modelscopeVoice} />;
    }
    if (resolvedActiveTab === 'asr') {
      return <AsrTab controlBarProps={controlBarProps} />;
    }
    if (resolvedActiveTab === 'mode') {
      return <ModeTab controlBarProps={controlBarProps} />;
    }
    if (resolvedActiveTab === 'stop_prompt') {
      return <StopPromptTab controlBarProps={controlBarProps} />;
    }
    return <TemplateTab tourModePanelProps={tourModePanelProps} />;
  }, [
    resolvedActiveTab,
    controlBarProps,
    ttsMode,
    modelscopeVoice,
    onChangeModelscopeVoice,
    ttsFetchConcurrency,
    onChangeTtsFetchConcurrency,
    showHistoryPanel,
    onChangeShowHistoryPanel,
    showDebugPanel,
    onChangeShowDebugPanel,
    stagePanelProps,
    onQuickSummary,
    onPrevStop,
    onNextStop,
    onClearExhibitChatSessions,
    ragflowStatusLabel,
    ragflowStatusDetail,
    tourModePanelProps,
  ]);

  if (docked) {
    return (
      <aside className="settings-docked" aria-label="设置">
        <div className="settings-header settings-header-docked">
          <div className="settings-title">设置</div>
        </div>
        <div className="settings-body">
          <TabBar activeTab={resolvedActiveTab} onTabChange={onTabChange} />
          <div className="settings-tab-panel">{tabContent}</div>
        </div>
      </aside>
    );
  }

  return (
    <SettingsDrawer open={open} title="设置" onClose={onClose}>
      <TabBar activeTab={resolvedActiveTab} onTabChange={onTabChange} />
      <div className="settings-tab-panel">{tabContent}</div>
    </SettingsDrawer>
  );
}
