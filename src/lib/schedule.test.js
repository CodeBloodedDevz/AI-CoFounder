import {
  addDays, dayLabel, followUpList, followUpMessage, monthGrid, normalizePhone, normalizeTime, parseISO,
  smsUrl, splitWork, timeSlots, todayISO, validateWork, whatsappUrl, longDate,
} from './schedule';

const NOW = new Date(2026, 9, 10, 12, 0); // Sat 10 Oct 2026

describe('dates', () => {
  it('parses only real calendar dates', () => {
    expect(parseISO('2026-10-12')).toBeInstanceOf(Date);
    for (const bad of ['2026-02-30', '12/10/2026', '2026-1-5', '', null, undefined, '2026-13-01']) expect(parseISO(bad)).toBeNull();
  });

  it('labels days relative to today', () => {
    expect(todayISO(NOW)).toBe('2026-10-10');
    expect(dayLabel('2026-10-10', NOW)).toBe('Today');
    expect(dayLabel('2026-10-11', NOW)).toBe('Tomorrow');
    expect(dayLabel('2026-10-09', NOW)).toBe('Yesterday');
    expect(dayLabel('2026-10-12', NOW)).toBe('Mon 12 Oct');
    expect(dayLabel('2027-01-05', NOW)).toBe('Tue 5 Jan 2027');
    expect(longDate('2026-10-11', NOW)).toBe('Tomorrow · Sun 11 Oct 2026');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('builds a Monday-first calendar', () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});

describe('normalizeTime', () => {
  it('understands the ways people type times', () => {
    const cases = { '14:30': '14:30', '14.30': '14:30', '1430': '14:30', '2pm': '14:00', '2:30 pm': '14:30', '12am': '00:00', '12pm': '12:00', '9': '09:00', '09:05': '09:05', '': '' };
    for (const [input, want] of Object.entries(cases)) expect(normalizeTime(input)).toBe(want);
    for (const bad of ['25:00', '12:60', 'noon', '13pm', '0am']) expect(normalizeTime(bad)).toBeNull();
    expect(normalizeTime(undefined)).toBe('');
  });
  it('offers half-hour slots', () => {
    const slots = timeSlots(6, 21, 30);
    expect(slots[0]).toBe('06:00');
    expect(slots.at(-1)).toBe('21:00');
  });
});

describe('validateWork', () => {
  it('accepts a good form and cleans it', () => {
    const r = validateWork({ title: ' Taper fade ', service: 'Haircut', customerId: '', date: '2026-10-12', time: '2pm', status: '' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ title: 'Taper fade', time: '14:00', status: 'Pending', date: '2026-10-12' });
  });
  it('explains what is wrong', () => {
    const r = validateWork({ title: '', date: '12/10/2026', time: 'noon' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['date', 'time', 'title']);
    expect(validateWork({ title: 'x', date: '' }).errors.date).toMatch(/pick a date/i);
  });
});

describe('splitWork', () => {
  const w = (id, date, status = 'Pending', time = '') => ({ id, date, status, time });
  it('separates what is ahead from what is done, sorted sensibly', () => {
    const { upcoming, past } = splitWork(
      [w('a', '2026-10-12', 'Confirmed', '10:00'), w('b', '2026-10-10', 'Pending', '15:00'), w('c', '2026-10-10', 'Pending', '09:00'),
       w('d', '2026-10-09', 'Pending'), w('e', '2026-10-20', 'Completed'), w('f', '2026-10-15', 'Cancelled'), w('g', null, 'Pending')],
      NOW
    );
    expect(upcoming.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(past.map((x) => x.id).slice(0, 3)).toEqual(['e', 'f', 'd']);
    expect(splitWork(undefined, NOW)).toEqual({ upcoming: [], past: [] });
  });
});

describe('phones and links', () => {
  it('normalises South African numbers', () => {
    expect(normalizePhone('082 123 4567')).toBe('27821234567');
    expect(normalizePhone('+27 82 123 4567')).toBe('27821234567');
    expect(normalizePhone('0027821234567')).toBe('27821234567');
    expect(normalizePhone('821234567')).toBe('27821234567');
    expect(normalizePhone('(011) 555-0123')).toBe('27115550123');
    for (const bad of ['', 'abc', '123', null, undefined]) expect(normalizePhone(bad)).toBeNull();
  });
  it('builds WhatsApp and SMS links with the text encoded', () => {
    expect(whatsappUrl('0821234567', 'Hi there & welcome')).toBe('https://wa.me/27821234567?text=Hi%20there%20%26%20welcome');
    expect(smsUrl('0821234567', 'Hi', 'android')).toBe('sms:+27821234567?body=Hi');
    expect(smsUrl('0821234567', 'Hi', 'ios')).toBe('sms:+27821234567&body=Hi');
    expect(whatsappUrl('nope', 'x')).toBeNull();
    expect(smsUrl('', 'x')).toBeNull();
  });
});

describe('messages', () => {
  it('writes a follow-up using first name, business and last service', () => {
    const m = followUpMessage({ kind: 'followup', customerName: 'Thando Mokoena', businessName: 'Donnel Goods', service: 'Haircut' });
    expect(m).toMatch(/^Hi Thando from Donnel Goods!/);
    expect(m).toMatch(/another haircut/);
  });
  it('writes a reminder with the day and time', () => {
    const base = { kind: 'reminder', customerName: 'Sipho', businessName: 'Shop' };
    expect(followUpMessage({ ...base, work: { service: 'Haircut', date: '2026-10-12', time: '14:30' }, now: NOW })).toMatch(/about your Haircut on Mon 12 Oct at 14:30\./);
    expect(followUpMessage({ ...base, work: { title: 'Fade', date: '2026-10-11' }, now: NOW })).toMatch(/about your Fade tomorrow\./);
  });
  it('copes with missing names', () => {
    expect(followUpMessage({})).toMatch(/^Hi there!/);
  });
});

describe('followUpList', () => {
  const customers = [{ id: 'c1', name: 'Old' }, { id: 'c2', name: 'New' }, { id: 'c3', name: 'Booked' }, { id: 'c4', name: 'Recent' }, { id: 'c5', name: 'Older' }];
  const work = [
    { id: 'w1', customerId: 'c1', status: 'Completed', date: '2026-08-20', service: 'Haircut' },
    { id: 'w2', customerId: 'c3', status: 'Confirmed', date: '2026-10-14' },
    { id: 'w3', customerId: 'c4', status: 'Completed', date: '2026-10-01' },
    { id: 'w4', customerId: 'c5', status: 'Completed', date: '2026-06-01', service: 'Braids' },
  ];

  it('picks people with no booking and no recent visit, longest gap first', () => {
    const list = followUpList(customers, work, { now: NOW });
    expect(list.map((x) => x.customer.name)).toEqual(['Older', 'Old', 'New']);
    expect(list[0]).toMatchObject({ lastService: 'Braids', reason: 'Last visit 19 weeks ago' });
    expect(list.at(-1).reason).toBe('No visits recorded yet');
  });

  it('leaves out people you messaged in the last week', () => {
    const list = followUpList(customers, work, { now: NOW, contacted: { c1: '2026-10-08', c5: '2026-09-01' } });
    expect(list.map((x) => x.customer.name)).toEqual(['Older', 'New']);
  });

  it('is empty without customers', () => {
    expect(followUpList([], [], { now: NOW })).toEqual([]);
    expect(followUpList(undefined, undefined)).toEqual([]);
  });
});
