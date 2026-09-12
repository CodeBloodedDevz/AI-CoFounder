import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

export default function LoginScreen({ navigation }) {
  const { login, loginWithGoogle, state } = useApp();
  const { t } = useTranslation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // Navigation resets automatically via RootNavigator once state.user / state.business
  // change — no explicit redirect needed after a successful login.
  const handleSubmit = () => {
    const result = login(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
  };

  const handleGoogle = () => {
    const result = loginWithGoogle();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        <Text style={styles.title}>{t('welcomeBack')} 👋</Text>
        <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>
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

      {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

      <Button onPress={handleSubmit}>{t('logIn')}</Button>

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
  link: { fontSize: 12.5, color: colors.textSoft },
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 12.5, marginVertical: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkRowText: { color: colors.textSoft, fontSize: 13.5 },
  linkStrong: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
});
