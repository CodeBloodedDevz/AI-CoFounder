import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

export default function SplashScreen({ navigation }) {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View>
        <Text style={styles.title}>AI{'\n'}CO-FOUNDER</Text>
        <Text style={styles.tagline}>{t('tagline')}</Text>
      </View>

      <View style={styles.orbWrap}>
        <Animated.View style={[styles.orbGlow, { transform: [{ scale }], opacity }]} />
        <View style={styles.orbRing} />
        <View style={styles.orb}>
          <Text style={styles.orbLabel}>AI</Text>
        </View>
      </View>

      <View>
        <Text style={styles.footer}>{t('taglineFooter')}</Text>
        <Button onPress={() => navigation.navigate('Register')}>{t('getStarted')}</Button>
        <View style={{ height: 12 }} />
        <Button variant="outline" onPress={() => navigation.navigate('Login')}>
          {t('logIn')}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, fontWeight: '900', color: colors.primary, lineHeight: 38, marginTop: 12 },
  tagline: { color: colors.textMuted, marginTop: 8, fontSize: 14.5 },
  orbWrap: { alignItems: 'center', justifyContent: 'center', height: 220 },
  orbGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primary,
  },
  orbRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  orb: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbLabel: { color: colors.white, fontSize: 30, fontWeight: '900' },
  footer: { textAlign: 'center', color: colors.textMuted, fontSize: 13.5, marginBottom: 20 },
});
