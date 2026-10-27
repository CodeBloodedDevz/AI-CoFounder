import { useCallback, useEffect, useRef, useState } from 'react';

// State for <Banner>: show('success' | 'error', text). Success messages hide themselves after a few seconds.
export function useBanner(timeoutMs = 3500) {
  const [banner, setBanner] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback(
    (type, text) => {
      clearTimeout(timer.current);
      setBanner(text ? { type, text } : null);
      if (type === 'success' && text) timer.current = setTimeout(() => setBanner(null), timeoutMs);
    },
    [timeoutMs]
  );
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setBanner(null);
  }, []);
  return { banner, show, clear };
}
