import { cleanBaseUrl, hostFromExpoUri, resolveApiUrl } from './apiUrl';

test('hostFromExpoUri reads the dev machine and ignores tunnels', () => {
  expect(hostFromExpoUri('192.168.1.42:8081')).toBe('192.168.1.42');
  expect(hostFromExpoUri('exp://10.0.0.5:8081')).toBe('10.0.0.5');
  expect(hostFromExpoUri('abc-123.exp.direct:80')).toBeNull();
  expect(hostFromExpoUri(undefined)).toBeNull();
});

test('cleanBaseUrl adds http:// and drops trailing slashes', () => {
  expect(cleanBaseUrl('192.168.1.5:4000/')).toBe('http://192.168.1.5:4000');
  expect(cleanBaseUrl('https://api.example.com//')).toBe('https://api.example.com');
  expect(cleanBaseUrl('  ')).toBe('');
});

test('resolveApiUrl picks the right server for each place the app runs', () => {
  expect(resolveApiUrl({ env: 'https://api.x.com', os: 'ios' }).url).toBe('https://api.x.com');
  expect(resolveApiUrl({ os: 'web', location: { hostname: 'localhost', protocol: 'http:' } }).url).toBe('http://localhost:4000');
  expect(resolveApiUrl({ os: 'web', location: { hostname: '192.168.1.9', protocol: 'http:' } }).url).toBe('http://192.168.1.9:4000');
  expect(resolveApiUrl({ os: 'android', hostUri: '192.168.1.42:8081' }).url).toBe('http://192.168.1.42:4000');
  expect(resolveApiUrl({ os: 'ios', hostUri: '192.168.1.42:8081' }).url).toBe('http://192.168.1.42:4000');
  expect(resolveApiUrl({ os: 'android', hostUri: 'x.exp.direct' }).url).toBe('http://10.0.2.2:4000');
  expect(resolveApiUrl({ os: 'ios' }).url).toBe('http://localhost:4000');
});
