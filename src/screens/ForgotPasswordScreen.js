import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import Banner from '../components/Banner';
import BackButton from '../components/BackButton';
import Icon from '../components/Icon';
import { useApp, MIN_PASSWORD_LENGTH } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';

// Forgot password: prove the account is yours with the recovery key you were given when you signed up, then
// choose a new password. Nothing is emailed. After it works you are logged in and shown a NEW recovery key.
// Route params: { email? } (filled in from the Login screen).
export default function ForgotPasswordScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { recoverAccount } = useApp();
  const [form, setForm] = useState({ email: route?.params?.email || '', recoveryKey: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  // Types the key in the usual groups as people enter it: k7mq2xwpah... -> K7MQ2-XWPAH-...
  const setKey = (v) => {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    set('recoveryKey')(clean.replace(/(.{5})(?=.)/g, '$1-'));
  };

  const submit = async () => {
    if (busy) return;
    setMessage('');
    setErrors({});
    setBusy(true);
    const r = await recoverAccount({ email: form.email, recoveryKey: form.recoveryKey, password: form.password, confirmPassword: form.confirm });
    setBusy(false);
    if (r.ok) {
      // Logged in: the app shows the new recovery key next. If logging in didn't work, go to Log in.
      if (!r.signedIn) navigation.navigate('Login', { passwordReset: true });
      return;
    }
    if (r.field) setErrors({ [r.field === 'confirmPassword' ? 'confirm' : r.field]: r.error });
    else setMessage(r.error);
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        <BackButton navigation={navigation} />
        <View style={styles.badge}>
          <Icon name="key-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('forgot.title')}</Text>
        <Text style={styles.subtitle}>{t('recovery.forgotSubtitle')}</Text>
      </View>

      <Banner type="error" text={message} onClose={() => setMessage('')} />

      <Input
        label={t('email')}
        placeholder={t('identifierPlaceholder')}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={errors.email}
      />
      <Input
        label={t('recovery.keyLabel')}
        placeholder="K7MQ2-XWPAH-3DRTN-VYC9E"
        value={form.recoveryKey}
        onChangeText={setKey}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={23}
        error={errors.recoveryKey}
        hint={errors.recoveryKey ? undefined : t('recovery.keyHint')}
      />
      <Input
        label={t('forgot.newPassword')}
        placeholder={t('register.atLeast', { count: MIN_PASSWORD_LENGTH })}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="password-new"
        textContentType="newPassword"
        error={errors.password}
      />
      <Input
        label={t('confirmPassword')}
        value={form.confirm}
        onChangeText={set('confirm')}
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={submit}
        error={errors.confirm}
      />
      <Button onPress={submit} loading={busy} disabled={busy}>{t('forgot.setPassword')}</Button>

      <Pressable onPress={() => setShowHelp((v) => !v)} style={{ alignSelf: 'center', marginTop: 18 }} accessibilityRole="button">
        <Text style={styles.link}>{t('recovery.noKey')}</Text>
      </Pressable>
      {showHelp ? <Text style={styles.help}>{t('recovery.noKeyHelp')}</Text> : null}

      <Pressable onPress={() => navigation.navigate('Login')} style={{ alignSelf: 'center', marginTop: 20 }} accessibilityRole="button">
        <Text style={styles.link}>{t('recovery.backToLogIn')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...type.pageTitle, fontSize: 26 },
  subtitle: { ...type.pageSubtitle, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
  help: { fontSize: 13, color: colors.textSoft, lineHeight: 19, marginTop: 10, textAlign: 'center' },
});
