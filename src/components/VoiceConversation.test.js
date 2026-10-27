import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockListener = { onLevel: null, segs: 0 };
jest.mock('../lib/voice/micListener', () => ({
  createMicListener: () => ({
    start: async (cb) => { mockListener.onLevel = cb; },
    cut: async () => ({ uri: `seg-${++mockListener.segs}`, durationMs: 900 }),
    discard: async () => {},
    release: () => {},
    stop: async () => {},
  }),
}));
const mockSpoken = [];
jest.mock('../lib/voice/speaker', () => ({
  createSpeaker: () => ({
    speak: async (text, lang) => { mockSpoken.push([text, lang]); return { spoken: true }; },
    stop: async () => {},
  }),
}));
const mockApi = { transcribeLive: jest.fn(), voiceRespond: jest.fn() };
jest.mock('../context/AppContext', () => ({ useApp: () => mockApi }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import VoiceConversation from './VoiceConversation';

const texts = (tree) => JSON.stringify(tree.toJSON());
const flush = async (ms = 0) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };

// speech-like loudness (it must wobble, or it is treated as steady noise)
async function talk(ms) {
  for (let t = 0; t < ms; t += 60) {
    mockListener.onLevel(-20 + (t % 120 === 0 ? 4 : -4));
    await flush(60);
  }
}
async function quiet(ms) {
  for (let t = 0; t < ms; t += 60) {
    mockListener.onLevel(-75 + (t % 120 === 0 ? 1 : -1));
    await flush(60);
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  mockListener.segs = 0;
  mockSpoken.length = 0;
  mockApi.transcribeLive.mockReset();
  mockApi.voiceRespond.mockReset();
});
afterEach(() => jest.useRealTimers());
jest.setTimeout(40000);

test('Live Voice listens, auto-sends after a pause, translates/answers and speaks', async () => {
  mockApi.transcribeLive.mockResolvedValue({ ok: true, text: 'How much Coke do I have?', language: 'en' });
  mockApi.voiceRespond.mockResolvedValue({ ok: true, reply: 'You have four Coke left.', to: 'en', from: 'en' });
  const onTurn = jest.fn();
  let tree;
  await act(async () => { tree = renderer.create(<VoiceConversation history={[]} onTurn={onTurn} />); });
  await flush(10);
  expect(texts(tree)).toContain('Listening');

  await quiet(600);
  await talk(1200);
  expect(texts(tree)).toContain('Hearing you');
  await quiet(1500);
  await flush(500);

  expect(mockApi.transcribeLive).toHaveBeenCalledTimes(1);
  expect(mockApi.voiceRespond).toHaveBeenCalledTimes(1);
  expect(mockApi.voiceRespond.mock.calls[0][0]).toMatchObject({ text: 'How much Coke do I have?', from: 'en', mode: 'conversation' });
  expect(mockSpoken[0]).toEqual(['You have four Coke left.', 'en']);
  expect(onTurn).toHaveBeenCalledWith(expect.objectContaining({ mode: 'conversation', user: expect.objectContaining({ text: 'How much Coke do I have?' }) }));
  expect(texts(tree)).toContain('Detected: ","English');
  expect(texts(tree)).toContain('You have four Coke left.');
  await act(async () => { tree.unmount(); });
});

test('an unfinished sentence is held and merged instead of being sent early', async () => {
  mockApi.transcribeLive
    .mockResolvedValueOnce({ ok: true, text: 'I sold five Coke today and', language: 'en' })
    .mockResolvedValueOnce({ ok: true, text: 'two breads as well', language: 'en' });
  mockApi.voiceRespond.mockResolvedValue({ ok: true, reply: 'Okay.', to: 'en', from: 'en' });
  let tree;
  await act(async () => { tree = renderer.create(<VoiceConversation history={[]} onTurn={() => {}} />); });
  await quiet(600);
  await talk(900);
  await quiet(1300); // normal pause, but the sentence is unfinished
  expect(mockApi.voiceRespond).not.toHaveBeenCalled();
  expect(texts(tree)).toContain('Take your time');
  await talk(900);
  await quiet(1500);
  await flush(500);
  expect(mockApi.voiceRespond).toHaveBeenCalledTimes(1);
  expect(mockApi.voiceRespond.mock.calls[0][0].text).toBe('I sold five Coke today and two breads as well');
  await act(async () => { tree.unmount(); });
});

test('interpreter mode asks for a translation into the chosen language', async () => {
  mockApi.transcribeLive.mockResolvedValue({ ok: true, text: 'Good morning, how are you?', language: 'en' });
  mockApi.voiceRespond.mockResolvedValue({ ok: true, reply: 'Goeie môre, hoe gaan dit?', to: 'af', from: 'en' });
  let tree;
  await act(async () => { tree = renderer.create(<VoiceConversation history={[]} onTurn={() => {}} />); });
  const seg = tree.root.findAllByType(require('./SegmentedControl').default)[0];
  await act(async () => { seg.props.onChange('interpreter'); });
  const selects = tree.root.findAllByType(require('./Select').default);
  await act(async () => { selects[0].props.onChange('Afrikaans'); });
  await quiet(600);
  await talk(1000);
  await quiet(1500);
  await flush(500);
  expect(mockApi.voiceRespond.mock.calls[0][0]).toMatchObject({ mode: 'interpreter', targetLang: 'af', from: 'en' });
  expect(mockSpoken[0]).toEqual(['Goeie môre, hoe gaan dit?', 'af']);
  await act(async () => { tree.unmount(); });
});
