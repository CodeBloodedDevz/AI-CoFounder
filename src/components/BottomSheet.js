import { useCallback, useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { useKeyboardInset, dismissKeyboard } from '../hooks/useKeyboard';
import KeyboardDismissButton from './KeyboardDismissButton';

const IOS = Platform.OS === 'ios';

// Same look as the Select pop-up (dimmed background, white sheet sliding up),
// shared by the date picker, time picker, follow-up message sheet and the edit sheets.
//
// Typing in a sheet: the sheet sits on top of the keyboard (never behind it) and shrinks to the space
// that is left, the field being typed in is scrolled into view, and a "Hide keyboard" button replaces
// the plain Close line while the keyboard is open. A tap on the dimmed background, or dragging the
// sheet's content, also closes the keyboard (the first tap never throws away what was typed).
export default function BottomSheet({ visible, title, onClose, children, closeLabel }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardInset();
  const closeText = closeLabel ?? t('common.close');

  // Keep the field that has the cursor inside the visible part of the sheet once the keyboard is up.
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const viewport = useRef(0);
  const revealFocused = useCallback(() => {
    const scroll = scrollRef.current;
    const input = TextInput.State?.currentlyFocusedInput?.();
    const inner = scroll?.getInnerViewRef?.();
    if (!scroll || !input || !inner || typeof input.measureLayout !== 'function' || !viewport.current) return;
    try {
      input.measureLayout(
        inner,
        (x, y, w, h) => {
          const top = scrollY.current;
          const bottom = top + viewport.current;
          const margin = 12;
          if (y - margin < top) scroll.scrollTo({ y: Math.max(0, y - margin), animated: true });
          else if (y + h + margin > bottom) scroll.scrollTo({ y: Math.max(0, Math.min(y - margin, y + h + margin - viewport.current)), animated: true });
        },
        () => {}
      );
    } catch (e) {
      // the field is not inside this sheet: nothing to do
    }
  }, []);
  useEffect(() => {
    if (!visible || !kb.shown) return undefined;
    const timer = setTimeout(revealFocused, IOS ? 260 : 120); // after the sheet has moved up
    return () => clearTimeout(timer);
  }, [visible, kb.shown, kb.inset, revealFocused]);

  // While typing, the first tap outside the sheet only closes the keyboard.
  const onBackdrop = () => (kb.shown ? dismissKeyboard() : onClose?.());

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View ref={kb.ref} onLayout={kb.onLayout} style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onBackdrop} accessibilityLabel={kb.shown ? t('common.hideKeyboard') : t('common.close')} />
        <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: kb.inset }]} pointerEvents="box-none">
          <View style={[styles.sheet, kb.shown ? styles.sheetTyping : { paddingBottom: 8 + insets.bottom }]}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={IOS ? 'interactive' : 'on-drag'}
              contentContainerStyle={styles.body}
              onLayout={(e) => {
                viewport.current = e.nativeEvent.layout.height;
              }}
              onScroll={(e) => {
                scrollY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={32}
            >
              {children}
            </ScrollView>
            {kb.shown ? (
              <View style={styles.typingBar}>
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={styles.typingClose}>
                  <Text style={styles.closeText}>{closeText}</Text>
                </Pressable>
                <KeyboardDismissButton />
              </View>
            ) : (
              <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
                <Text style={styles.closeText}>{closeText}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23,19,31,0.4)' },
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 8,
  },
  // With the keyboard open the sheet may use all the room above it (the top inset keeps it off the status bar).
  sheetTyping: { maxHeight: '100%', paddingBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, padding: 18, paddingBottom: 6 },
  body: { paddingHorizontal: 18, paddingBottom: 8 },
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeText: { color: colors.textMuted, fontWeight: '600' },
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  typingClose: { paddingVertical: 4 },
});
