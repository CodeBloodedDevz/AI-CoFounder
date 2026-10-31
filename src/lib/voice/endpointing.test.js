import { clampPause, holdMsFor, isCompleteThought, mergeTranscripts } from './endpointing';

describe('isCompleteThought', () => {
  it.each([
    ['How is my business doing?', true],
    ['What should I restock today.', true],
    ['Thank you!', true],
    ['Hello.', true],
    ['Show me my sales', true],
    ['Hoe gaan dit met my besigheid?', true],
    ['Add a product Snacks at a quantity of 200 at a bought price of R8', true],
    ['Sold two Coke at R15 each', true],
    ['Sold 10 loaves for 150 rand', true],
  ])('%s -> %s', (text, want) => expect(isCompleteThought(text)).toBe(want));

  it.each([
    'I want to know about',
    'Tell me about my stock and',
    'So,',
    'Well...',
    'um',
    'Uh,',
    'I was thinking that',
    'What is the price of the',
    'Ek wil weet van my voorraad en',
    'because',
    'Add a product Snacks quantity',
    'Add a product Snacks at a bought price of',
    'Record a sale of Coke at a price',
    'Voeg produk by hoeveelheid',
    '',
  ])('treats "%s" as unfinished', (text) => expect(isCompleteThought(text)).toBe(false));

  it('trusts a question mark even after a joining word', () => {
    expect(isCompleteThought('What are you going to do about it and why?')).toBe(true);
  });
});

describe('mergeTranscripts', () => {
  it('joins parts and drops trailing ellipses', () => {
    expect(mergeTranscripts('I want to know about...', 'my stock levels.')).toBe('I want to know about my stock levels.');
    expect(mergeTranscripts('Show me,', '… the sales')).toBe('Show me, the sales');
    expect(mergeTranscripts('', 'hello')).toBe('hello');
    expect(mergeTranscripts('hello', '')).toBe('hello');
  });
});

describe('timing helpers', () => {
  it('waits longer for unfinished sentences when the pause setting is longer', () => {
    expect(holdMsFor(700)).toBe(1200);
    expect(holdMsFor(1100)).toBe(1650);
    expect(holdMsFor(3000)).toBe(3000);
  });
  it('keeps the pause setting within sensible limits, in 0.1 s steps', () => {
    expect(clampPause(100)).toBe(500);
    expect(clampPause(9000)).toBe(3000);
    expect(clampPause(1130)).toBe(1100);
  });
});
