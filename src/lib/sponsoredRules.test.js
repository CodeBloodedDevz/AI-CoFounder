// Sponsored helpers used by the app screens.
import { createEventQueue, dailySeed, profileProblemKeys, imageDataUrl, displayPhone, initialsOf, endsSoon, statusTone } from './sponsoredRules';

describe('event queue', () => {
  test('batches views and sends each advert/kind once per visit', () => {
    const sent = [];
    const timers = [];
    const q = createEventQueue({ send: (b) => sent.push(b), setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} });
    expect(q.add('a', 'impression')).toBe(true);
    expect(q.add('a', 'impression')).toBe(false);
    q.add('b', 'impression');
    q.add('a', 'click');
    expect(sent).toEqual([]);
    timers[0]();
    expect(sent).toEqual([[{ adId: 'a', type: 'impression' }, { adId: 'b', type: 'impression' }, { adId: 'a', type: 'click' }]]);
    q.flush();
    expect(sent.length).toBe(1);
  });

  test('sends straight away when the batch is full', () => {
    const sent = [];
    const q = createEventQueue({ send: (b) => sent.push(b), max: 2, setTimer: () => 1, clearTimer: () => {} });
    q.add('a', 'impression');
    q.add('b', 'impression');
    expect(sent).toEqual([[{ adId: 'a', type: 'impression' }, { adId: 'b', type: 'impression' }]]);
  });
});

test('the rotation seed changes per person and per day', () => {
  expect(dailySeed('u1', new Date(2026, 9, 23))).toBe('u1:2026-10-23');
  expect(dailySeed('u1', new Date(2026, 9, 24))).not.toBe(dailySeed('u1', new Date(2026, 9, 23)));
  expect(dailySeed(null, new Date(2026, 0, 2))).toBe('guest:2026-01-02');
});

test('a business page needs a name, a description and a contact', () => {
  expect(profileProblemKeys({})).toEqual(['sponsored.page.needName', 'sponsored.page.needAbout', 'sponsored.page.needContact']);
  expect(profileProblemKeys({ displayName: 'Thandi Threads', about: 'Handmade streetwear and custom printed T-shirts.', website: 'x' })).toEqual([]);
});

test('pictures, phone numbers, initials and statuses for display', () => {
  expect(imageDataUrl({ base64: 'AAA', mimeType: 'image/png' })).toBe('data:image/png;base64,AAA');
  expect(imageDataUrl({ uri: 'data:image/jpeg;base64,BBB' })).toBe('data:image/jpeg;base64,BBB');
  expect(imageDataUrl({ uri: 'file:///x.jpg' })).toBeNull();
  expect(displayPhone('27821234567')).toBe('+27 82 123 4567');
  expect(displayPhone('447700900123')).toBe('+447700900123');
  expect(initialsOf('Thandi Threads')).toBe('TT');
  expect(initialsOf('')).toBe('B');
  expect(endsSoon({ status: 'active', daysLeft: 2 })).toBe(true);
  expect(endsSoon({ status: 'active', daysLeft: 9 })).toBe(false);
  expect(statusTone('active')).toBe('success');
  expect(statusTone('weird')).toBe('neutral');
});
