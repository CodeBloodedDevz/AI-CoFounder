// Saves the AI chat on the phone/browser so it is still there after the
// person leaves the screen or refreshes. Kept per logged-in user, so two
// people sharing a device never see each other's questions.
//
// A saved message looks like { id, from: 'user' | 'ai', text, replyTo? }.
// An answer carries `replyTo` = the id of the question it answers, so a
// question and its answer are treated as one "exchange" when deleting.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'ai-cofounder-chat-v1:';
export const MAX_SAVED_MESSAGES = 200;

export const storageKeyFor = (identifier) => (identifier ? `${KEY_PREFIX}${String(identifier).toLowerCase()}` : null);

let counter = 0;
export const newMessageId = () => `m_${Date.now().toString(36)}_${(counter++).toString(36)}`;

const isValid = (m) =>
  m && typeof m.id === 'string' && (m.from === 'user' || m.from === 'ai') && typeof m.text === 'string';

/** Messages that belong together share a key: the question's id. */
export const exchangeKey = (m) => m.replyTo || m.id;

export function pruneForSaving(messages) {
  return messages
    .filter((m) => !m.local && isValid(m))
    .slice(-MAX_SAVED_MESSAGES)
    .map(({ id, from, text, replyTo }) => (replyTo ? { id, from, text, replyTo } : { id, from, text }));
}

/** Removes every message whose exchange key is in `keys` (a Set). */
export function removeExchanges(messages, keys) {
  return messages.filter((m) => m.local || !keys.has(exchangeKey(m)));
}

export async function loadChat(key) {
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch (e) {
    return []; // corrupted or unavailable storage: start with an empty chat
  }
}

export async function saveChat(key, messages) {
  if (!key) return;
  try {
    const saved = pruneForSaving(messages);
    if (saved.length) await AsyncStorage.setItem(key, JSON.stringify(saved));
    else await AsyncStorage.removeItem(key);
  } catch (e) {
    // Storage full or blocked (e.g. private browsing): the chat still works, it just won't be remembered.
  }
}
