// src/hooks/useAsync.js
import { useState, useEffect, useCallback, useRef } from 'react';

// Runs asyncFn and tracks { data, loading, error }. A response that arrives after a newer request
// has started (e.g. typing fast in a search box) is ignored, so the screen never shows stale results.
// refetch({ silent: true }) refreshes without showing the loading spinner again.
export function useAsync(asyncFn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const latest = useRef(0);

  const execute = useCallback(async ({ silent = false } = {}) => {
    const id = ++latest.current;
    if (!silent) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await asyncFn();
      if (id === latest.current) setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      if (id === latest.current) setState(s => ({ data: silent ? s.data : null, loading: false, error: err.message }));
      return undefined;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { execute(); }, [execute]);

  return { ...state, refetch: execute };
}

/** The value, but only after it stopped changing for `ms` (search boxes). */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
