import { VoiceKitPressToTalkProvider } from './VoiceKitPressToTalkProvider';

export function createPressToTalkProvider({ providerType = 'voicekit_ws', onLog } = {}) {
  const type = String(providerType || 'voicekit_ws').trim().toLowerCase();
  if (type === 'voicekit_ws' || type === 'sauc_ws') {
    return new VoiceKitPressToTalkProvider({ onLog });
  }
  throw new Error(`unsupported_press_to_talk_provider:${type}`);
}
