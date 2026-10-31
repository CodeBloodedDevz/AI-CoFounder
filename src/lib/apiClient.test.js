import { ApiError, createApiClient } from './apiClient';

const silent = { warn() {}, log() {} };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const make = (fetchImpl, extra = {}) =>
  createApiClient({ baseUrl: 'http://x:4000', getToken: async () => 't1', fetchImpl, log: silent, ...extra });

test('sends the token and returns the JSON body', async () => {
  const f = jest.fn().mockResolvedValue(reply(200, [{ id: 1 }]));
  const data = await make(f).request('/products');
  expect(data).toEqual([{ id: 1 }]);
  expect(f.mock.calls[0][0]).toBe('http://x:4000/products');
  expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer t1');
});

test('errors carry the server message and status', async () => {
  const f = jest.fn().mockResolvedValue(reply(400, { error: 'Amount must be greater than 0.' }));
  await expect(make(f).request('/transactions', { method: 'POST', body: '{}' })).rejects.toMatchObject({
    message: 'Amount must be greater than 0.',
    status: 400,
  });
  expect(f).toHaveBeenCalledTimes(1); // writes are never repeated automatically
});

test('a 401 refreshes the token once and retries', async () => {
  const f = jest.fn().mockResolvedValueOnce(reply(401, { error: 'Invalid or expired session.' })).mockResolvedValueOnce(reply(200, { ok: 1 }));
  const client = make(f, { refreshToken: async () => 't2' });
  expect(await client.request('/customers')).toEqual({ ok: 1 });
  expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer t2');
});

test('reads retry once after a network failure, writes do not', async () => {
  const f = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(reply(200, []));
  expect(await make(f).request('/work')).toEqual([]);
  expect(f).toHaveBeenCalledTimes(2);

  const g = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  const err = await make(g).request('/work', { method: 'POST', body: '{}' }).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.network).toBe(true);
  expect(err.message).toMatch(/failed to fetch.*http:\/\/x:4000/i);
  expect(g).toHaveBeenCalledTimes(1);
});

test('no token means not logged in, without calling the server', async () => {
  const f = jest.fn();
  const client = createApiClient({ baseUrl: 'http://x', getToken: async () => null, fetchImpl: f, log: silent });
  await expect(client.request('/x')).rejects.toMatchObject({ status: 401 });
  expect(f).not.toHaveBeenCalled();
});

test('a slow server times out with a clear message', async () => {
  jest.useFakeTimers();
  const f = jest.fn((url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))));
  const p = make(f, { timeoutMs: 1000 }).request('/slow', { method: 'POST' }).catch((e) => e);
  await jest.advanceTimersByTimeAsync(1100);
  const err = await p;
  expect(err.timeout).toBe(true);
  expect(err.message).toMatch(/took too long/);
  jest.useRealTimers();
});
