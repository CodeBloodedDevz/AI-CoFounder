import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Input from './Input';
import Button from './Button';
import Banner from './Banner';
import Icon from './Icon';
import RecoveryKeyCard from './RecoveryKeyCard';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';

// Profile -> Account recovery: whether this account has a recovery key, and making a new one (asks for the
// password first). Accounts from before recovery keys existed start here. The new key is shown once.
export default function RecoveryKeySection() {
  const { getRecoveryStatus, createRecoveryKey } = useApp();
  const { t, formatDate } = useTranslation();
  const [status, setStatus] = useState(null); // { hasKey, createdAt } | { error }
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    let alive = true;
    getRecoveryStatus().then((r) => alive && setStatus(r.ok ? r : { error: r.error }));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await createRecoveryKey(password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNewKey(r.key);
    setPassword('');
    setAsking(false);
    setStatus({ ok: true, hasKey: true, createdAt: new Date().toISOString() });
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="key-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>{t('recovery.sectionTitle')}</Text>
      </View>
      <Text style={styles.text}>{t('recovery.sectionText')}</Text>
      {status === null ? (
        <Text style={styles.muted}>{t('recovery.checking')}</Text>
      ) : status.error ? (
        <Text style={[styles.muted, { color: colors.danger }]}>{status.error}</Text>
      ) : status.hasKey ? (
        <Text style={[styles.status, { color: colors.success }]}>
          {t('recovery.hasKey', { date: status.createdAt ? formatDate(String(status.createdAt).slice(0, 10)) : '—' })}
        </Text>
      ) : (
        <Text style={[styles.status, { color: colors.warning }]}>{t('recovery.noKeyYet')}</Text>
      )}

      {newKey ? (
        <>
          <RecoveryKeyCard recoveryKey={newKey} />
          <Text style={styles.muted}>{t('recovery.newKeyNote')}</Text>
          <Button variant="outline-accent" size="sm" onPress={() => setNewKey('')} style={{ marginTop: 10 }}>{t('recovery.iSavedItShort')}</Button>
        </>
      ) : asking ? (
        <View style={{ marginTop: 10 }}>
          <Banner type="error" text={error} onClose={() => setError('')} />
          <Input label={t('passwordLabel')} value={password} onChangeText={setPassword} secureTextEntry returnKeyType="go" onSubmitEditing={create} hint={t('recovery.passwordHint')} />
          <Button onPress={create} loading={busy} disabled={busy || !password}>{t('recovery.createKey')}</Button>
          <Button variant="outline-accent" onPress={() => { setAsking(false); setPassword(''); setError(''); }} style={{ marginTop: 10 }} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </View>
      ) : (
        <Button variant="outline-accent" size="sm" icon="key-outline" onPress={() => setAsking(true)} style={{ marginTop: 10 }}>
          {status?.hasKey ? t('recovery.replaceKey') : t('recovery.createKey')}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginTop: 24, backgroundColor: colors.white },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { ...type.formTitle, marginBottom: 0 },
  text: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  status: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  muted: { fontSize: 12.5, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
});
