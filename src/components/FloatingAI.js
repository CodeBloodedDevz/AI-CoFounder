import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AIChatPanel from './AIChatPanel';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { useAssistant } from '../context/AssistantContext';
import { colors, gradient, radius, shadow } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { useKeyboardInset, dismissKeyboard } from '../hooks/useKeyboard';

const TAB_BAR_HEIGHT = 62; // keep in sync with MainTabs
const WIDE_BREAKPOINT = 640;
const NATIVE = Platform.OS !== 'web';

// The AI Co-Founder as a floating button, available on every screen once the
// person is logged in. Tap it and it grows into the chat; the X shrinks it back.
//   phones:           chat opens as a bottom sheet over a dimmed background
//   tablets/desktops: chat opens as a floating card in the bottom-right corner
export default function FloatingAI({ routeName }) {
  const { t } = useTranslation();
  const { state } = useApp();
  const { isOpen, open, close, pendingAsk, clearAsk, setButtonShown, fabClearance } = useAssistant();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [everOpened, setEverOpened] = useState(false); // mount the chat on first open, then keep it (history, drafts, in-flight replies)
  const [panelVisible, setPanelVisible] = useState(false);
  // How much of the screen the keyboard covers, so the chat (and its input) can sit right above it.
  const kb = useKeyboardInset();
  const keyboardUp = kb.shown;

  const wide = width >= WIDE_BREAKPOINT;
  const allowed = Boolean(state.user && state.business) && routeName !== 'BusinessSetup';
  const hasTabBar = routeName === 'Main';

  // Open / close animation.
  useEffect(() => {
    if (isOpen) {
      setEverOpened(true);
      setPanelVisible(true);
    }
    const animation = Animated.timing(progress, {
      toValue: isOpen ? 1 : 0,
      duration: isOpen ? 240 : 190,
      easing: isOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: NATIVE,
    });
    animation.start(({ finished }) => {
      if (finished && !isOpen) setPanelVisible(false);
    });
    return () => animation.stop();
  }, [isOpen, progress]);

  // Close the chat if the person logs out / leaves the app's main area.
  useEffect(() => {
    if (!allowed && isOpen) close();
  }, [allowed, isOpen, close]);

  // Let screens leave room at the bottom for the button.
  const shown = allowed && !keyboardUp;
  useEffect(() => {
    setButtonShown(allowed);
    return () => setButtonShown(false);
  }, [allowed, setButtonShown]);

  // Phones: the button is tucked away while the keyboard is up (see `shown`) so it never covers an input.

  // Desktop: Escape closes the chat.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen || typeof document === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const onAskHandled = useCallback((id) => clearAsk(id), [clearAsk]);

  if (!allowed) return null;

  const bottomOffset = (hasTabBar ? TAB_BAR_HEIGHT : 0) + insets.bottom + 16;
  const fabBottom = bottomOffset + fabClearance; // sits above a screen's own action button, never on it
  const rightOffset = 16 + insets.right;

  const fabStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }],
  };

  const panelMotion = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [wide ? 24 : 80, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [wide ? 0.92 : 1, 1] }) },
    ],
  };

  // The keyboard lifts the chat: the sheet / card sits right on top of it and gets shorter, so the
  // header, the latest messages, the input and the send button all stay in view while typing.
  const areaHeight = kb.height || height; // the space this layer actually has (smaller if the system resized the window)
  const lift = kb.inset;
  const cardBottom = lift ? Math.max(bottomOffset, lift + 12) : bottomOffset;
  const cardHeight = Math.max(lift ? 220 : 320, Math.min(680, areaHeight - cardBottom - insets.top - 16));
  const sheetHeight = Math.max(200, Math.min(areaHeight - insets.top - 12 - lift, Math.round(areaHeight * 0.9)));
  const panelBoxStyle = wide
    ? [styles.card, { right: rightOffset + 4, bottom: cardBottom, width: Math.min(400, width - 32), height: cardHeight }]
    : [styles.sheet, { height: sheetHeight, bottom: lift, paddingBottom: lift ? 0 : insets.bottom }];

  return (
    <View style={styles.root} ref={kb.ref} onLayout={kb.onLayout}>
      {/* Dim the app behind the sheet on phones. Tapping it closes the chat (while typing, the first tap
          only closes the keyboard, so a half-written question isn't lost). */}
      {!wide && panelVisible ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={keyboardUp ? dismissKeyboard : close}
            accessibilityLabel={keyboardUp ? t('common.hideKeyboard') : t('common.closeAiChat')}
          />
        </Animated.View>
      ) : null}

      {everOpened ? (
        <Animated.View
          style={[panelBoxStyle, panelMotion, !panelVisible && styles.hidden]}
          accessibilityViewIsModal={isOpen && !wide}
        >
          <AIChatPanel active={isOpen} onClose={close} ask={pendingAsk} onAskHandled={onAskHandled} />
        </Animated.View>
      ) : null}

      {shown ? (
        <Animated.View
          style={[styles.fabWrap, { right: rightOffset, bottom: fabBottom }, fabStyle]}
        >
          <Pressable
            onPress={open}
            disabled={isOpen}
            accessibilityRole="button"
            accessibilityLabel={t('floatingAI.openAiCoFounderChat')}
            accessibilityHint={t('floatingAI.opensChat')}
            style={({ pressed }) => [styles.fabPress, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={gradient.colors}
              start={gradient.start}
              end={gradient.end}
              style={[styles.fab, wide ? styles.fabWide : styles.fabCompact]}
            >
              <Icon name="sparkles" size={wide ? 18 : 22} color={colors.white} />
              {wide ? <Text style={styles.fabLabel}>{t('floatingAI.askAi')}</Text> : null}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, pointerEvents: 'box-none', zIndex: 1000, elevation: 1000 },
  backdrop: { backgroundColor: 'rgba(20, 18, 33, 0.45)' },
  hidden: { display: 'none' },
  fabWrap: { position: 'absolute', pointerEvents: 'box-none' },
  fabPress: { borderRadius: radius.pill, ...shadow.raised },
  fab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  fabCompact: { width: 54, height: 54 },
  fabWide: { height: 48, paddingHorizontal: 18, gap: 8 },
  fabLabel: { color: colors.white, fontSize: 13.5, fontWeight: '700' },
  card: {
    position: 'absolute',
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.raised,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.raised,
  },
});
