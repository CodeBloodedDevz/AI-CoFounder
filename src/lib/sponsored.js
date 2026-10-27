// The Sponsored page in the app: talking to /sponsored on the backend, opening links and Paystack checkout,
// choosing pictures, and reporting views / taps. The server decides everything that matters (prices, what is
// shown, who may advertise); this file only asks it and displays the answer.
import { useMemo } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { createEventQueue, imageDataUrl, MAX_IMAGE_BYTES } from './sponsoredRules';

export { CATEGORY_IDS, STATUS_TONE, statusTone, dailySeed, profileProblemKeys, createEventQueue, endsSoon, displayPhone, initialsOf } from './sponsoredRules';

const PENDING_AD_PAYMENT_KEY = 'ai-cofounder-pending-ad-payment-v1';
const PENDING_MAX_AGE_MS = 24 * 60 * 60_000;
const enc = encodeURIComponent;

/** Every Sponsored call, bound to the app's API client. Each returns { ok, data } | { ok:false, error, code }. */
export function useSponsoredApi() {
  const { apiCall } = useApp();
  return useMemo(() => {
    const get = (path) => apiCall(path);
    const send = (method, path, body) => apiCall(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return {
      meta: () => get('/sponsored/meta'),
      browse: ({ category, q, seed, page } = {}) => {
        const qs = new URLSearchParams();
        if (category) qs.set('category', category);
        if (q) qs.set('q', q);
        if (seed) qs.set('seed', seed);
        if (page) qs.set('page', String(page));
        return get(`/sponsored/ads?${qs.toString()}`);
      },
      ad: (id) => get(`/sponsored/ads/${enc(id)}`),
      events: (events) => send('POST', '/sponsored/events', { events }),
      report: (id, reason, details) => send('POST', `/sponsored/ads/${enc(id)}/report`, { reason, details }),

      profile: () => get('/sponsored/me/profile'),
      saveProfile: (fields) => send('PUT', '/sponsored/me/profile', fields),
      upload: (data) => apiCall('/sponsored/me/media', { method: 'POST', body: JSON.stringify({ data }), timeoutMs: 60_000 }),

      myAds: () => get('/sponsored/me/ads'),
      myAd: (id) => get(`/sponsored/me/ads/${enc(id)}`),
      createAd: (fields) => send('POST', '/sponsored/me/ads', fields),
      editAd: (id, fields) => send('PUT', `/sponsored/me/ads/${enc(id)}`, fields),
      checkout: (id) => send('POST', `/sponsored/me/ads/${enc(id)}/checkout`),
      withdraw: (id) => send('POST', `/sponsored/me/ads/${enc(id)}/withdraw`),
      renew: (id, fields) => send('POST', `/sponsored/me/ads/${enc(id)}/renew`, fields),
      verifyPayment: (reference) => get(`/sponsored/me/orders/${enc(reference)}/verify`),
      cancelPayment: (reference) => send('POST', `/sponsored/me/orders/${enc(reference)}/cancel`),
    };
  }, [apiCall]);
}

/* ------------------------------ payments ------------------------------ */

// A checkout that was opened is remembered, so the result is picked up when the person comes back
// (on the web, Paystack's page replaces the app; on a phone it opens in the browser).
export async function trackAdPayment(reference, adId) {
  try { await AsyncStorage.setItem(PENDING_AD_PAYMENT_KEY, JSON.stringify({ reference, adId, at: Date.now() })); } catch (e) { /* not critical */ }
}
export async function getTrackedAdPayment() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(PENDING_AD_PAYMENT_KEY)) || 'null');
    if (!v?.reference || Date.now() - Number(v.at || 0) > PENDING_MAX_AGE_MS) return null;
    return v;
  } catch (e) {
    return null;
  }
}
export async function clearTrackedAdPayment() {
  try { await AsyncStorage.removeItem(PENDING_AD_PAYMENT_KEY); } catch (e) { /* nothing to clear */ }
}

/** Sends the person to Paystack's secure checkout page. */
export async function openCheckout(url) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return true;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/** Opens a website, WhatsApp chat, phone call or email. -> true when something opened. */
export async function openExternal(url) {
  if (!url) return false;
  if (Platform.OS === 'web' && /^https?:/i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------ pictures ------------------------------ */

/**
 * Lets the person choose a picture from their phone / computer and returns it ready to upload.
 *   kind: 'logo' (square) | 'banner' (16:9)
 *   -> { ok: true, data, uri } | { ok: false, reason: 'cancelled' | 'denied' | 'tooLarge' | 'unreadable' }
 */
export async function pickImage(kind = 'banner') {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm && perm.granted === false && perm.canAskAgain === false) return { ok: false, reason: 'denied' };
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 9],
      quality: 0.7,
      base64: true,
    });
    if (!res || res.canceled || !res.assets?.length) return { ok: false, reason: 'cancelled' };
    const asset = res.assets[0];
    const data = imageDataUrl(asset);
    if (!data) return { ok: false, reason: 'unreadable' };
    if (Math.floor((data.length - data.indexOf(',') - 1) * 0.75) > MAX_IMAGE_BYTES) return { ok: false, reason: 'tooLarge' };
    return { ok: true, data, uri: asset.uri };
  } catch (e) {
    console.warn('[sponsored] picking a picture failed:', e?.message);
    return { ok: false, reason: 'unreadable' };
  }
}
