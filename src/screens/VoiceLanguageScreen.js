import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Screen from '../components/Screen';
import Button from '../components/Button';
import Icon from '../components/Icon';
import ScreenHeader from '../components/ScreenHeader';
import { Toggle } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { DEFAULT_VOICE_SETTINGS, VOICE_SETTINGS_KEY, sanitizeSettings } from '../lib/voice/settings';
import { colors, radius, gradient } from '../theme';

// Designer's "Voice & Language" page: the one place where the app's language is changed (More only
// shows the current choice and links here). It edits two things the app already has:
//   * the interface language (the business's saved "preferred language", also chosen during first setup)
//   * "Read answers aloud" (the same voice setting Live Voice and the chat use)
export default function VoiceLanguageScreen({ navigation }) {
  const { t, language, setLanguage, languages } = useTranslation();
  const [chosen, setChosen] = useState(language);
  const [speak, setSpeak] = useState(DEFAULT_VOICE_SETTINGS.speak);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(VOICE_SETTINGS_KEY);
        if (raw) setSpeak(sanitizeSettings(JSON.parse(raw)).speak);
      } catch (e) {
        // no storage: keep the default
      }
    })();
  }, []);

  const testVoice = () => {
    try {
      Speech.stop();
      Speech.speak(t('voiceLanguage.testPhrase'), { language: 'en-ZA' });
    } catch (e) {
      // no speech engine on this device
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let stored = {};
      try {
        stored = JSON.parse((await AsyncStorage.getItem(VOICE_SETTINGS_KEY)) || '{}') || {};
      } catch (e) {
        stored = {};
      }
      await AsyncStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(sanitizeSettings({ ...stored, speak })));
      if (chosen !== language) {
        const r = await setLanguage(chosen);
        if (r && r.ok === false && r.error) {
          setMessage({ ok: false, text: r.error });
          return;
        }
      }
      setMessage({ ok: true, text: t('voiceLanguage.saved') });
    } catch (e) {
      setMessage({ ok: false, text: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader navigation={navigation} title={t('voiceLanguage.title')} subtitle={t('voiceLanguage.subtitle')} />

      <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.hero}>
        <View style={styles.heroGlow} pointerEvents="none" />
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Icon name="mic" size={24} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.engineBadge}>
              <Icon name="sparkles" size={11} color={colors.white} />
              <Text style={styles.engineText}>{t('voiceLanguage.engine')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('voiceLanguage.heroTitle')}</Text>
          </View>
          <Pressable onPress={testVoice} accessibilityRole="button" accessibilityLabel={t('voiceLanguage.test')} style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.8 }]}>
            <Icon name="volume-high" size={15} color={colors.white} />
            <Text style={styles.testText}>{t('voiceLanguage.test')}</Text>
          </Pressable>
        </View>
        <View style={styles.heroBottom}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.speakTitle}>{t('voiceLanguage.speakTitle')}</Text>
            <Text style={styles.speakHint}>{t('voiceLanguage.speakHint')}</Text>
          </View>
          <Toggle value={speak} onValueChange={setSpeak} label={t('voiceLanguage.speakTitle')} trackOn="rgba(255,255,255,0.55)" />
        </View>
      </LinearGradient>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{t('voiceLanguage.languagesTitle')}</Text>
        <Text style={styles.listHint}>{t('voiceLanguage.languagesHint')}</Text>
      </View>

      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = chosen === lang.name;
        return (
          <Pressable
            key={lang.code}
            onPress={() => setChosen(lang.name)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={lang.label}
            style={[styles.langCard, active && styles.langCardActive]}
          >
            <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
            <View style={{ flex: 1 }}>
              <View style={styles.langTitleRow}>
                <Text style={styles.langName}>{lang.label}</Text>
                {lang.name === language ? (
                  <View style={styles.primaryTag}>
                    <Text style={styles.primaryTagText}>{t('voiceLanguage.primary')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.langDesc}>{t(`voiceLanguage.desc.${lang.code}`)}</Text>
            </View>
            {active ? <Icon name="checkmark-circle" size={22} color={colors.success} /> : null}
          </Pressable>
        );
      })}

      {/* Moved here with the language choice (it used to sit under the picker in More). */}
      {languages?.find((l) => l.name === chosen)?.complete === false ? <Text style={styles.partial}>{t('settings.partialNote')}</Text> : null}

      {message ? <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text> : null}

      <Button icon="checkmark-circle-outline" loading={saving} disabled={saving} onPress={save} style={{ marginTop: 8 }}>
        {t('voiceLanguage.save')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 20, marginBottom: 22, overflow: 'hidden' },
  heroGlow: { position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  engineBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  engineText: { color: colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroTitle: { color: colors.white, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  testText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  heroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)' },
  speakTitle: { color: colors.white, fontSize: 14, fontWeight: '600' },
  speakHint: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, marginTop: 2 },
  listHead: { marginBottom: 10, paddingHorizontal: 2 },
  listTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  listHint: { fontSize: 13, color: colors.textSoft, marginTop: 1 },
  langCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg + 4, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 10 },
  langCardActive: { borderWidth: 2, borderColor: colors.primary, padding: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  langTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  langName: { fontSize: 15, fontWeight: '700', color: colors.text },
  primaryTag: { backgroundColor: 'rgba(130,52,198,0.14)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  primaryTagText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  langDesc: { fontSize: 13, color: colors.textSoft, marginTop: 2 },
  partial: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: 8, lineHeight: 17 },
  message: { fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 6, textAlign: 'center' },
});
