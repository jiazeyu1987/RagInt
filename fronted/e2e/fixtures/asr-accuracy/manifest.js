const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function resolveRepoPath(...parts) {
  return path.resolve(REPO_ROOT, ...parts);
}

function normalizeAsrText(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, '')
    .replace(/[.,!?;:'"“”‘’()\[\]{}<>/\\|@#$%^&*_+=~`，。！？；：、（）【】《》]/g, '');
}

const fixtures = [
  {
    id: 'no-answer-short',
    title: '短句未命中提示',
    sourceKind: 'tts_cache',
    audioPath: resolveRepoPath('backend', 'data', 'qa_audio_cache', 'audio', 'pair_26_1772285795055.wav'),
    expectedText: '知识库中未找到您要的答案！',
    holdMs: 3200,
    maxFinalWaitMs: 12000,
  },
  {
    id: 'math-2x2',
    title: '数学短句样本',
    sourceKind: 'tts_cache',
    audioPath: resolveRepoPath('backend', 'data', 'qa_audio_cache', 'audio', 'pair_5_1772074812566.wav'),
    expectedText: '2乘以2等于4，就像你有两个小球，再复制一份，总共就有四个小球了',
    holdMs: 7400,
    maxFinalWaitMs: 16000,
  },
  {
    id: 'coating-domain',
    title: '领域长句样本',
    sourceKind: 'tts_cache',
    audioPath: resolveRepoPath('backend', 'data', 'qa_audio_cache', 'audio', 'pair_32_1772602487561.wav'),
    expectedText:
      '磷酰胆碱涂层是一种特殊的生物相容性涂层，它能够减少血栓的形成，提高医疗器械的安全性和有效性。这种涂层常用于密网支架等医疗设备上，术后只需单抗治疗，大大降低了患者的用药负担。',
    holdMs: 19500,
    maxFinalWaitMs: 22000,
  },
].map((item) => ({
  ...item,
  expectedNormalizedText: normalizeAsrText(item.expectedText),
}));

function resolveFixtureById(fixtureId) {
  const id = String(fixtureId || '').trim();
  return fixtures.find((item) => item.id === id) || null;
}

module.exports = {
  REPO_ROOT,
  fixtures,
  normalizeAsrText,
  resolveFixtureById,
};
