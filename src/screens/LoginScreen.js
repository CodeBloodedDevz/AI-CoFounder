import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, gradient } from '../theme';
import Icon from '../components/Icon';

export default function LoginScreen({ navigation }) {
  const { login, loginWithGoogle } = useApp();
  const { t } = useTranslation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // login() now talks to Supabase over the network, so it's async — the
  // button shows a spinner (via the Button component's `loading` prop)
  // while we wait for the response.
  const handleSubmit = async () => {
    setLoading(true);
    const result = await login(form);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
  };

  const handleGoogle = async () => {
    const result = await loginWithGoogle();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
  };

  return (
    <Screen>
      <View style={{ marginTop: 12, marginBottom: 20 }}>
        <Text style={styles.title}>AI Co-Founder</Text>
        <Text style={styles.subtitle}>Run your business with clarity and confidence.</Text>
      </View>

      <View style={styles.logoWrap}>
        <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.logo}>
          <Text style={styles.logoText}>AI</Text>
        </LinearGradient>
      </View>

      <Input
        label={t('identifierLabel')}
        placeholder={t('identifierPlaceholder')}
        value={form.identifier}
        onChangeText={set('identifier')}
        autoCapitalize="none"
      />
      <Input
        label={t('passwordLabel')}
        placeholder={t('passwordPlaceholder')}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
      />

      <Pressable style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: 12 }}>
        <Text style={styles.link}>{t('forgotPassword')}</Text>
      </Pressable>

      {error ? <Text style={styles.error}><Icon name="warning-outline" size={15} color={colors.danger} /> {error}</Text> : null}

      <Button onPress={handleSubmit} loading={loading} disabled={loading}>{t('logIn')}</Button>

      <Text style={styles.divider}>{t('orContinueWith')}</Text>
      <Button variant="outline" onPress={handleGoogle}>
        {t('continueWithGoogle')}
      </Button>

      <View style={styles.linkRow}>
        <Text style={styles.linkRowText}>{t('noAccount')} </Text>
        <Pressable onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkStrong}>{t('register')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  logoWrap: { alignItems: 'center', marginVertical: 28 },
  logo: { width: 96, height: 96, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.white, fontSize: 30, fontWeight: '900' },
  link: { fontSize: 12.5, color: colors.textSoft },
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 12.5, marginVertical: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkRowText: { color: colors.textSoft, fontSize: 13.5 },
  linkStrong: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
});
