// Works out which backend address the app should call, so the same code runs
// in a browser on the laptop, in Expo Go on a phone, and on an emulator
// without anyone editing a hard-coded address.
//
// Order of preference:
//   1. EXPO_PUBLIC_API_URL      (set it in .env for a deployed backend, a tunnel, or to override everything)
//   2. Browser                  -> the same host the page was opened from, port 4000
//   3. Phone / emulator in dev  -> the computer running `expo start` (taken from Expo's hostUri), port 4000
//   4. Android emulator         -> 10.0.2.2 (the emulator's name for the computer)
//   5. localhost
//
// "localhost" on a real phone is the phone itself, which is why a fixed
// http://localhost:4000 only ever worked in the browser.

export const API_PORT = 4000;

const TUNNEL_HOST = /(\.exp\.direct|\.ngrok[\w-]*\.(io|app|dev)|\.trycloudflare\.com|\.loca\.lt)$/i;

/** "192.168.1.42:8081" | "exp://192.168.1.42:8081" -> "192.168.1.42"; null for tunnels / blanks. */
export function hostFromExpoUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const noScheme = uri.replace(/^[a-z+.-]+:\/\//i, '');
  const host = noScheme.split('/')[0].split(':')[0].trim();
  if (!host || TUNNEL_HOST.test(host)) return null;
  return host;
}

/** Makes sure it is a full URL with no trailing slash. */
export function cleanBaseUrl(value) {
  const v = String(value || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
}

export function resolveApiUrl({ env, os, location, hostUri, port = API_PORT } = {}) {
  const fromEnv = cleanBaseUrl(env);
  if (fromEnv) return { url: fromEnv, source: 'EXPO_PUBLIC_API_URL' };

  if (os === 'web') {
    const host = location?.hostname || 'localhost';
    const protocol = location?.protocol === 'https:' ? 'https:' : 'http:';
    return { url: `${protocol}//${host}:${port}`, source: 'this web page\'s host' };
  }

  const host = hostFromExpoUri(hostUri);
  if (host) return { url: `http://${host}:${port}`, source: "your computer (from Expo)" };

  if (os === 'android') return { url: `http://10.0.2.2:${port}`, source: 'Android emulator default' };
  return { url: `http://localhost:${port}`, source: 'localhost default' };
}
