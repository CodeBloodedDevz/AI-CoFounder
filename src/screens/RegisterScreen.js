import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import { useApp, MIN_PASSWORD_LENGTH } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

export default function RegisterScreen({ navigation }) {
  const { register } = useApp();
  const { t } = useTranslation();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = () => {
    const result = register(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
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
      />
      <Input
        label={t('passwordLabel')}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
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
      />

      {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

      <Button onPress={handleSubmit}>{t('createAccount')}</Button>

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
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  linkRowText: { color: colors.textSoft, fontSize: 13.5 },
  linkStrong: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
});
