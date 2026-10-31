import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { useTranslation } from '../i18n/I18nContext';
import { useInterFonts } from '../lib/fonts';
import { colors, shadow } from '../theme';

// The opening screen, built from the designer's splash (aico_splash_screen HTML + screenshot).
// It is shown on every launch: RootNavigator keeps it up for at least `MIN_VISIBLE_MS` and, if the
// session / saved data is still loading after that, until they are ready. Then it calls `onFinish`.

export const MIN_VISIBLE_MS = 3000;
const STATUS_EVERY_MS = 1000;
const FONT_WAIT_MS = 1200; // never hold the screen back for a slow font
const VERSION_LABEL = 'v2.4.2 (ZA Edition)'; // as drawn in the design

const BAR_W = 120; // half of the 240 track, as in the design
const STATUS_KEYS = ['splash.status.secure', 'splash.status.workspace', 'splash.status.copilot'];

// Native animations are not available in a desktop browser; there the same animation runs on the JS thread.
const NATIVE = Platform.OS !== 'web';

// A soft round glow (the design's blurred circles), drawn as a radial gradient so it looks the same on
// phones and in the browser. `id` must be unique per glow on the page.
function Glow({ id, size, color, opacity, style }) {
  return (
    <Svg width={size} height={size} style={[styles.glow, style]} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.55} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

export default function SplashScreen({ onFinish }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useInterFonts();
  const [fontWaitOver, setFontWaitOver] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);

  const appear = useRef(new Animated.Value(0)).current; // content fade-in
  const pulse = useRef(new Animated.Value(0)).current; // logo breathing
  const drift = useRef(new Animated.Value(0)).current; // top-left glow
  const travel = useRef(new Animated.Value(0)).current; // progress bar
  const ping = useRef(new Animated.Value(0)).current; // status dot
  const statusOpacity = useRef(new Animated.Value(1)).current;

  const contentReady = fontsLoaded || !!fontError || fontWaitOver;

  // Hand control back once the minimum time has passed.
  useEffect(() => {
    const done = setTimeout(() => onFinish && onFinish(), MIN_VISIBLE_MS);
    const font = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => {
      clearTimeout(done);
      clearTimeout(font);
    };
  }, [onFinish]);

  // Show the text only once the typeface is ready, so it never changes font in front of the user.
  useEffect(() => {
    if (!contentReady) return;
    Animated.timing(appear, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [contentReady, appear]);

  // Looping animations.
  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1900, easing: ease, useNativeDriver: NATIVE }),
          Animated.timing(pulse, { toValue: 0, duration: 1900, easing: ease, useNativeDriver: NATIVE }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 4000, easing: ease, useNativeDriver: NATIVE }),
          Animated.timing(drift, { toValue: 0, duration: 4000, easing: ease, useNativeDriver: NATIVE }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(travel, { toValue: 0.5, duration: 1100, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: NATIVE }),
          Animated.timing(travel, { toValue: 1, duration: 1100, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: NATIVE }),
          Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
        ])
      ),
      Animated.loop(Animated.timing(ping, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: NATIVE })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pulse, drift, travel, ping]);

  // Rotate the status line, fading between messages.
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(statusOpacity, { toValue: 0, duration: 180, useNativeDriver: NATIVE }).start(() => {
        setStatusIdx((i) => (i + 1) % STATUS_KEYS.length);
        Animated.timing(statusOpacity, { toValue: 1, duration: 180, useNativeDriver: NATIVE }).start();
      });
    }, STATUS_EVERY_MS);
    return () => clearInterval(id);
  }, [statusOpacity]);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });
  const logoOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });
  const driftStyle = useMemo(
    () => ({
      transform: [
        { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) },
        { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
        { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
      ],
    }),
    [drift]
  );
  const barX = travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-BAR_W, BAR_W * 0.1, BAR_W] });
  const pingScale = ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const pingOpacity = ping.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  return (
    <View style={styles.root} accessible accessibilityLabel={`AICO, ${t('splash.name')}`} accessibilityRole="progressbar">
      {/* Ambient background glows */}
      <View style={styles.bg} pointerEvents="none">
        <Animated.View style={[styles.glowTopLeft, driftStyle]}>
          <Glow id="g-top" size={340} color="#F1DBFF" opacity={0.85} />
        </Animated.View>
        <Glow id="g-mid" size={330} color="#FFDADB" opacity={0.7} style={styles.glowMid} />
        <Glow id="g-bottom" size={340} color="#E1E8FD" opacity={0.95} style={styles.glowBottom} />
      </View>

      <Animated.View style={[styles.layer, { opacity: appear }]}>
        {/* Centre: logo + identity */}
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <Glow id="g-logo" size={196} color="#B86DFD" opacity={0.35} style={styles.logoGlow} />
            <View style={styles.badge}>
              <Image
                source={require('../../assets/aico-logo.png')}
                style={styles.logo}
                resizeMode="cover"
                accessibilityLabel="AICO AI Co-Founder logo"
              />
            </View>
          </Animated.View>

          <View style={styles.nameRow}>
            <Text style={styles.name}>AICO</Text>
            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>AI</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>{t('splash.name')}</Text>
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>

          <View style={styles.africaPill}>
            <Icon name="sparkles" size={15} color={colors.primary} />
            <Text style={styles.africaText}>{t('splash.africa')}</Text>
          </View>
        </View>

        {/* Bottom: progress + trust marks */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, { transform: [{ translateX: barX }] }]}>
              <LinearGradient colors={[colors.crimson, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.dotWrap}>
              <Animated.View style={[styles.dotPing, { opacity: pingOpacity, transform: [{ scale: pingScale }] }]} />
              <View style={styles.dot} />
            </View>
            <Animated.Text style={[styles.status, { opacity: statusOpacity }]} accessibilityLiveRegion="polite">
              {t(STATUS_KEYS[statusIdx])}
            </Animated.Text>
          </View>

          <View style={styles.trustRow}>
            <Icon name="shield-checkmark" size={13} color={colors.success} />
            <Text style={styles.trust}>{t('splash.encrypted')}</Text>
            <Text style={styles.bullet}>{'•'}</Text>
            <Text style={styles.trust}>{t('splash.popia')}</Text>
          </View>
          <Text style={styles.version}>{VERSION_LABEL}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  bg: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glow: { position: 'absolute' },
  glowTopLeft: { position: 'absolute', top: -70, left: -90 },
  glowMid: { top: '50%', left: '50%', marginTop: -165, marginLeft: -165 },
  glowBottom: { bottom: -90, right: -90 },
  layer: { flex: 1, justifyContent: 'space-between' },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  logoGlow: { top: -26, left: -26 },
  badge: {
    width: 144,
    height: 144,
    borderRadius: 34,
    padding: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(220, 226, 247, 0.6)',
    overflow: 'hidden',
    ...shadow.raised,
  },
  logo: { width: '100%', height: '100%', borderRadius: 28 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1, color: colors.text },
  aiPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.crimsonLight },
  aiPillText: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: colors.crimson },
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.primary, marginBottom: 8 },
  tagline: { maxWidth: 260, textAlign: 'center', fontSize: 14, lineHeight: 22, color: colors.textSoft },
  africaPill: {
    marginTop: 20,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: 'rgba(220, 226, 247, 0.8)',
  },
  africaText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2, color: colors.text },

  footer: { alignItems: 'center', paddingHorizontal: 20 },
  track: { width: '100%', maxWidth: 240, height: 4, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 10 },
  bar: { width: BAR_W, height: '100%', borderRadius: 999, overflow: 'hidden' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  dotPing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  status: { fontSize: 11, lineHeight: 14, fontWeight: '500', letterSpacing: 0.4, color: colors.textSoft },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.75, marginBottom: 6 },
  trust: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4, color: colors.textSoft },
  bullet: { fontSize: 11, color: '#E2BEC0' },
  version: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4, color: '#8E6F71', opacity: 0.6 },
});
