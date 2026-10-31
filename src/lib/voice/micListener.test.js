jest.mock('expo-audio', () => ({
  AudioModule: {},
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, android: { outputFormat: 'mpeg4', audioEncoder: 'aac' }, ios: { outputFormat: 'aac ' } } },
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: class {} }));
import { nativeRecordingOptions } from './micListener';

const PRESET = {
  extension: '.m4a', sampleRate: 44100, numberOfChannels: 1, bitRate: 48000, isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: 'aac ', audioQuality: 127 },
  web: { mimeType: 'audio/webm' },
};

test('the preset is flattened the way the native recorder expects', () => {
  expect(nativeRecordingOptions(PRESET, 'android')).toMatchObject({ extension: '.m4a', numberOfChannels: 1, isMeteringEnabled: true, outputFormat: 'mpeg4', audioEncoder: 'aac' });
  expect(nativeRecordingOptions(PRESET, 'ios')).toMatchObject({ outputFormat: 'aac ', audioQuality: 127, isMeteringEnabled: true });
  expect(nativeRecordingOptions(PRESET, 'android').android).toBeUndefined();
  expect(nativeRecordingOptions(PRESET, 'ios').ios).toBeUndefined();
});
