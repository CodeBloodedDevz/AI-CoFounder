import { bytesToBase64, readRecording, RecordingError } from './audioUpload';

describe('audio upload', () => {
  test('base64 matches the standard encoding for every padding case', () => {
    const enc = (s) => bytesToBase64(new Uint8Array([...s].map((c) => c.charCodeAt(0))));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foobar')).toBe('Zm9vYmFy');
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
  test('a missing recording is a recording problem, not a server problem', async () => {
    let err;
    try {
      await readRecording(null, { os: 'ios' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RecordingError);
    expect(err.code).toBe('missing');
  });
});
