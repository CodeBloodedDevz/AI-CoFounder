import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

// Keyboard helpers shared by the chat panel, the bottom sheets and anything else that has a text box
// near the bottom of the screen.
//
// Why not just KeyboardAvoidingView? On Android the app draws edge to edge, so the window is no longer
// shrunk when the keyboard opens and anything pinned to the bottom ends up behind the keyboard. And a
// KeyboardAvoidingView inside an absolutely positioned panel (the AI chat sheet) measures itself
// against its parent instead of the screen, so on iPhones it lifts the input too little. These hooks
// work out the real overlap between a container and the keyboard, on both platforms, and still give 0
// when the system has already made room (an older Android build that resizes the window).

const IOS = Platform.OS === 'ios';
const NATIVE = Platform.OS !== 'web';
// iOS reports the keyboard before it animates (so the layout moves with it); Android after.
const SHOW = IOS ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = IOS ? 'keyboardWillHide' : 'keyboardDidHide';

/** Hides the keyboard (the same call everywhere, so screens don't import Keyboard just for this). */
export const dismissKeyboard = () => Keyboard.dismiss();

/** true while the on-screen keyboard is open. Always false on the web (the browser handles it). */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!NATIVE) return undefined;
    const a = Keyboard.addListener(SHOW, () => setVisible(true));
    const b = Keyboard.addListener(HIDE, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

/**
 * How many pixels of a container the keyboard covers.
 *   const kb = useKeyboardInset();
 *   <View ref={kb.ref} onLayout={kb.onLayout}> ... lift the bottom-pinned content by kb.inset ... </View>
 * -> { ref, onLayout, inset, shown, height (the container's measured height, or null) }
 */
export function useKeyboardInset() {
  const ref = useRef(null);
  const [frame, setFrame] = useState(null); // { y, height } of the container in window coordinates
  const [keyboard, setKeyboard] = useState(null); // { top, height } while open

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(y) || !Number.isFinite(h) || h <= 0) return;
      setFrame((f) => (f && Math.abs(f.y - y) < 1 && Math.abs(f.height - h) < 1 ? f : { y, height: h }));
    });
  }, []);

  const onLayout = useCallback(
    (e) => {
      const { y, height } = e?.nativeEvent?.layout || {};
      // Use the layout until the window position comes back (a full-screen container starts at 0).
      if (Number.isFinite(height) && height > 0) setFrame((f) => f || { y: y || 0, height });
      measure();
    },
    [measure]
  );

  useEffect(() => {
    if (!NATIVE) return undefined;
    const onShow = (e) => {
      const end = e?.endCoordinates;
      if (!end) return;
      const windowHeight = Dimensions.get('window').height;
      const top = Number.isFinite(end.screenY) && end.screenY > 0 ? end.screenY : windowHeight - (end.height || 0);
      setKeyboard({ top, height: end.height || 0 });
      measure();
    };
    const onHide = () => setKeyboard(null);
    const subs = [Keyboard.addListener(SHOW, onShow), Keyboard.addListener(HIDE, onHide)];
    // iOS: the keyboard changes height (predictive bar, emoji keyboard, a different language) while open.
    if (IOS) subs.push(Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const end = e?.endCoordinates;
      if (end && end.screenY < Dimensions.get('window').height) onShow(e);
    }));
    return () => subs.forEach((s) => s.remove());
  }, [measure]);

  let inset = 0;
  if (keyboard) {
    const bottom = frame ? frame.y + frame.height : Dimensions.get('window').height;
    // Never more than the keyboard itself plus a navigation bar's worth, whatever the coordinates say.
    inset = Math.max(0, Math.min(Math.round(bottom - keyboard.top), Math.round(keyboard.height + 64)));
  }
  return { ref, onLayout, inset, shown: Boolean(keyboard), height: frame ? frame.height : null };
}
