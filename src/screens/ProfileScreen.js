import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import Banner from '../components/Banner';
import BackButton from '../components/BackButton';
import { useBanner } from '../components/useBanner';
import RecoveryKeySection from '../components/RecoveryKeySection';
import { useApp } from '../context/AppContext';
import { colors, radius, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// The signed-in person's own details. The login email is shown but not edited here: it was verified
// with an emailed code when the account was made.
export default function ProfileScreen({ navigation }) {
  const { t } = useTranslation();
  const { state, updateUserProfile } = useApp();
  const [name, setName] = useState(state.user?.name && state.user.name !== state.user.identifier ? state.user.name : '');
  const [phone, setPhone] = useState(state.user?.phone || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { banner, show, clear } = useBanner();

  const changed = name.trim() !== (state.user?.name || '').trim() || phone.trim() !== (state.user?.phone || '').trim();

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) return setError(t('profile.nameRequired'));
    setError('');
    setSaving(true);
    const result = await updateUserProfile({ name, phone });
    setSaving(false);
    if (!result.ok) return show('error', result.error);
    show('success', t('profile.saved'));
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.profile')}</Text>
        <Text style={styles.subtitle}>{t('profile.manageYourPersonalDetails')}</Text>
      </View>

      <Banner type={banner?.type} text={banner?.text} onClose={clear} />

      <Input
        label={t('fullName')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (error) setError('');
        }}
        placeholder={t('profile.yourFullName')}
        error={error}
      />
      <Input label={t('phoneNumber')} value={phone} onChangeText={setPhone} placeholder={t('phoneNumber')} keyboardType="phone-pad" />

      <Text style={styles.label}>{t('profile.loginEmail')}</Text>
      <View style={styles.readonly}>
        <Text style={styles.readonlyText}>{state.user?.identifier || '—'}</Text>
      </View>
      <Text style={styles.hint}>{t('profile.emailHint')}</Text>

      <Button onPress={handleSave} loading={saving} disabled={saving || !changed}>{t('profile.saveChanges')}</Button>

      <RecoveryKeySection />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  readonly: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  readonlyText: { fontSize: 14.5, color: colors.textSoft },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 20 },
});
