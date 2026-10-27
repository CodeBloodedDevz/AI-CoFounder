import { useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import Banner from '../components/Banner';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, type } from '../theme';
import Icon from '../components/Icon';

// Google sign-in isn't connected yet (it needs a Google OAuth app set up in Supabase and the Expo
// auth-session package). The button used to show and then always fail, so it is hidden until then.
const GOOGLE_SIGN_IN_READY = false;

export default function LoginScreen({ navigation, route }) {
  const registered = route?.params?.registered;
  const passwordReset = route?.params?.passwordReset;
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
    if (loading) return;
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
        <Text style={styles.title}>{t('aiCoFounderChatTitle')}</Text>
        <Text style={styles.subtitle}>{t('login.runYourBusinessWithClarity')}</Text>
      </View>

      <View style={styles.logoWrap}>
        <Image source={require('../../assets/aico-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="AICO AI Co-Founder" />
      </View>

      {registered || passwordReset ? (
        <Text style={styles.success}>
          <Icon name="checkmark-circle-outline" size={15} color={colors.success} /> {passwordReset ? t('login.passwordChanged') : t('login.accountCreated')}
        </Text>
      ) : null}

      <Input
        label={t('identifierLabel')}
        placeholder={t('identifierPlaceholder')}
        value={form.identifier}
        onChangeText={set('identifier')}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <Input
        label={t('passwordLabel')}
        placeholder={t('passwordPlaceholder')}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      <Pressable
        style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: 12 }}
        onPress={() => navigation.navigate('ForgotPassword', { email: form.identifier })}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={styles.link}>{t('forgotPassword')}</Text>
      </Pressable>

      <Banner type="error" text={error} onClose={() => setError('')} />

      <Button onPress={handleSubmit} loading={loading} disabled={loading}>{t('logIn')}</Button>

      {GOOGLE_SIGN_IN_READY ? (
        <>
          <Text style={styles.divider}>{t('orContinueWith')}</Text>
          <Button variant="outline" onPress={handleGoogle}>
            {t('continueWithGoogle')}
          </Button>
        </>
      ) : null}

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
  subtitle: type.pageSubtitle,
  logoWrap: { alignItems: 'center', marginVertical: 28 },
  logo: { width: 132, height: 132 },
  link: { fontSize: 12.5, color: colors.primary, fontWeight: '700' },
  success: { color: colors.success, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 12.5, marginVertical: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkRowText: { color: colors.textSoft, fontSize: 13.5 },
  linkStrong: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
});
