// One place that talks to the backend. It
//   - always sends a fresh login token (and refreshes it once if the server says it expired),
//   - gives up after a timeout instead of hanging forever,
//   - retries a read once when the network blips,
//   - turns every failure into an ApiError that says what went wrong and where,
//   - logs failures (and, in development, every call) so nothing fails silently.

export class ApiError extends Error {
  constructor(message, { status = 0, network = false, timeout = false, path = '', code = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
    this.timeout = timeout;
    this.path = path;
    this.code = code; // machine-readable reason from the server, e.g. 'email_not_verified'
  }
}

export function createApiClient({ baseUrl, getToken, refreshToken, fetchImpl, timeoutMs = 20000, verbose = false, log = console }) {
  const doFetch = (...args) => (fetchImpl || fetch)(...args);

  async function attempt(path, options, token) {
    const controller = new AbortController();
    const outer = options.signal;
    const onOuterAbort = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', onOuterAbort);
    }
    let timedOut = false;
    // A request can ask for a longer wait (speech-to-text of a long note); everything else uses the default.
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs || timeoutMs);

    try {
      const { timeoutMs: _ignored, ...fetchOptions } = options;
      const res = await doFetch(`${baseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
      const data = await res.json().catch(() => null);
      return { res, data };
    } catch (e) {
      if (outer?.aborted) throw e; // the caller cancelled on purpose
      if (timedOut) {
        throw new ApiError(`The server at ${baseUrl} took too long to answer.`, { timeout: true, network: true, path });
      }
      throw new ApiError(`Failed to fetch: couldn't reach the server at ${baseUrl}.`, { network: true, path });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener?.('abort', onOuterAbort);
    }
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const started = Date.now();
    let token = await getToken();
    if (!token) throw new ApiError('Not logged in.', { status: 401, path });

    let out;
    try {
      try {
        out = await attempt(path, options, token);
      } catch (e) {
        // Reads are safe to repeat: one quick retry covers a dropped connection.
        if (e instanceof ApiError && e.network && method === 'GET') {
          await new Promise((r) => setTimeout(r, 400));
          out = await attempt(path, options, token);
        } else throw e;
      }

      if (out.res.status === 401 && refreshToken) {
        const fresh = await refreshToken();
        if (fresh && fresh !== token) {
          token = fresh;
          out = await attempt(path, options, token);
        }
      }
    } catch (e) {
      log.warn?.(`[api] ${method} ${path} FAILED after ${Date.now() - started}ms: ${e?.message}`);
      throw e;
    }

    const { res, data } = out;
    const ms = Date.now() - started;
    if (!res.ok) {
      log.warn?.(`[api] ${method} ${path} -> ${res.status} in ${ms}ms: ${data?.error || ''}`);
      throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, path, code: data?.code || '' });
    }
    if (verbose) log.log?.(`[api] ${method} ${path} -> ${res.status} in ${ms}ms`);
    return data;
  }

  return { request, baseUrl };
}
