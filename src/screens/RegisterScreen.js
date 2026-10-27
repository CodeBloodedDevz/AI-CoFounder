import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import Banner from '../components/Banner';
import { useApp, MIN_PASSWORD_LENGTH } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, type } from '../theme';
import BackButton from '../components/BackButton';

export default function RegisterScreen({ navigation }) {
  const { register } = useApp();
  const { t } = useTranslation();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    const result = await register(form);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setErrorCode(result.code || '');
      return;
    }
    setError('');
    // Account created and logged in: the app now shows the recovery key, then business setup.
    // (If logging in failed for some reason, the person can log in with the details they just chose.)
    if (!result.signedIn) navigation.navigate('Login', { registered: true });
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        <BackButton navigation={navigation} />
        <Text style={styles.title}>{t('createAccountTitle')}</Text>
        <Text style={styles.subtitle}>{t('createAccountSubtitle')}</Text>
      </View>

      <Input label={t('fullName')} placeholder={t('fullName')} value={form.fullName} onChangeText={set('fullName')} />
      <Input
        label={t('phoneNumber')}
        placeholder={t('phoneNumber')}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
      />
      <Input
        label={t('email')}
        placeholder={t('email')}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        hint={t('register.emailHint')}
      />
      <Input
        label={t('passwordLabel')}
        placeholder={t('register.atLeast', { count: MIN_PASSWORD_LENGTH })}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
      />
      <Input
        label={t('confirmPassword')}
        placeholder={t('confirmPassword')}
        value={form.confirmPassword}
        onChangeText={set('confirmPassword')}
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        error={form.confirmPassword && form.password && !form.password.startsWith(form.confirmPassword) ? t('err.passwordsMatch') : undefined}
      />

      <Banner type="error" text={error} onClose={() => setError('')} />
      {errorCode === 'already_registered' ? (
        <Pressable onPress={() => navigation.navigate('Login')} style={{ alignSelf: 'flex-start', marginTop: -6, marginBottom: 14 }} accessibilityRole="button">
          <Text style={styles.linkStrong}>{t('register.logInInstead')}</Text>
        </Pressable>
      ) : null}

      <Button onPress={handleSubmit} loading={loading} disabled={loading}>{t('createAccount')}</Button>

      <View style={styles.linkRow}>
        <Text style={styles.linkRowText}>{t('alreadyHaveAccount')} </Text>
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkStrong}>{t('logIn')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: type.pageSubtitle,
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkRowText: { color: colors.textSoft, fontSize: 13.5 },
  linkStrong: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
});
