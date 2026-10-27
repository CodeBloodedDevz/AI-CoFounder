import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Controls the floating AI chat: whether it is open, a question waiting to be
// asked (e.g. from a voice-note transcript), and whether the floating button
// is currently on screen (so screens can leave room for it at the bottom).
const AssistantContext = createContext(null);

const NOOP = {
  isOpen: false,
  open() {},
  close() {},
  toggle() {},
  ask() {},
  pendingAsk: null,
  clearAsk() {},
  buttonShown: false,
  setButtonShown() {},
  fabClearance: 0,
  setFabClearance() {},
};

export function AssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAsk, setPendingAsk] = useState(null);
  const [buttonShown, setButtonShown] = useState(false);
  // Height a screen's own floating action button (e.g. Add record) takes at the bottom-right, so the AI
  // button can sit above it instead of on top of it.
  const [fabClearance, setFabClearance] = useState(0);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const ask = useCallback((text) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    setPendingAsk({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: clean });
    setIsOpen(true);
  }, []);
  const clearAsk = useCallback((id) => setPendingAsk((current) => (current && current.id === id ? null : current)), []);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle, ask, pendingAsk, clearAsk, buttonShown, setButtonShown, fabClearance, setFabClearance }),
    [isOpen, open, close, toggle, ask, pendingAsk, clearAsk, buttonShown, fabClearance]
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  return useContext(AssistantContext) || NOOP;
}
