import { createPressToTalkProvider } from './createPressToTalkProvider';
import { VoiceKitPressToTalkProvider } from './VoiceKitPressToTalkProvider';

jest.mock('./VoiceKitPressToTalkProvider', () => ({
  VoiceKitPressToTalkProvider: jest.fn().mockImplementation(function Provider(opts) {
    this.opts = opts;
  }),
}));

describe('createPressToTalkProvider', () => {
  beforeEach(() => {
    VoiceKitPressToTalkProvider.mockClear();
  });

  test('creates voicekit provider for default and sauc_ws types', () => {
    const onLog = jest.fn();

    const p1 = createPressToTalkProvider({ onLog });
    const p2 = createPressToTalkProvider({ providerType: 'sauc_ws', onLog });

    expect(VoiceKitPressToTalkProvider).toHaveBeenCalledTimes(2);
    expect(VoiceKitPressToTalkProvider).toHaveBeenNthCalledWith(1, { onLog });
    expect(VoiceKitPressToTalkProvider).toHaveBeenNthCalledWith(2, { onLog });
    expect(p1).toBe(VoiceKitPressToTalkProvider.mock.instances[0]);
    expect(p2).toBe(VoiceKitPressToTalkProvider.mock.instances[1]);
  });

  test('throws for unsupported provider type', () => {
    expect(() => createPressToTalkProvider({ providerType: 'unknown' })).toThrow('unsupported_press_to_talk_provider:unknown');
  });
});
