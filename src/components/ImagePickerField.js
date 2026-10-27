import { useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, radius } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { pickImage } from '../lib/sponsored';

// A picture for the Sponsored page: choose from the phone / computer, upload, preview, change or remove.
//   kind="logo" (square) | "banner" (16:9)
//   upload(dataUrl) -> { ok, data: { url } } | { ok:false, error }   (useSponsoredApi().upload)
export default function ImagePickerField({ label, hint, value, onChange, kind = 'banner', upload }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async () => {
    setError('');
    const picked = await pickImage(kind);
    if (!picked.ok) {
      if (picked.reason !== 'cancelled') setError(t(`sponsored.image.${picked.reason}`));
      return;
    }
    setBusy(true);
    const r = await upload(picked.data);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onChange(r.data.url);
  };

  const logo = kind === 'logo';
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, !logo && styles.column]}>
        <Pressable
          onPress={busy ? undefined : choose}
          accessibilityRole="button"
          accessibilityLabel={value ? t('sponsored.image.change') : t('sponsored.image.choose')}
          style={({ pressed }) => [logo ? styles.logoBox : styles.bannerBox, pressed && { opacity: 0.8 }]}
        >
          {value ? (
            <Image source={{ uri: value }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.empty}>
              <Icon name={logo ? 'image-outline' : 'images-outline'} size={logo ? 22 : 28} color={colors.primary} />
              {!logo ? <Text style={styles.emptyText}>{t('sponsored.image.tapToChoose')}</Text> : null}
            </View>
          )}
          {busy ? (
            <View style={styles.busy}><ActivityIndicator color={colors.white} /></View>
          ) : null}
        </Pressable>
        <View style={logo ? styles.side : styles.under}>
          <View style={styles.actions}>
            <Pressable onPress={busy ? undefined : choose} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.action}>{value ? t('sponsored.image.change') : t('sponsored.image.choose')}</Text>
            </Pressable>
            {value && !busy ? (
              <Pressable onPress={() => onChange('')} accessibilityRole="button" hitSlop={6}>
                <Text style={[styles.action, styles.remove]}>{t('sponsored.image.remove')}</Text>
              </Pressable>
            ) : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  column: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  logoBox: { width: 76, height: 76, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surfaceLow, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  bannerBox: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceLow, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { fontSize: 13, color: colors.textSoft, fontWeight: '600' },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,27,43,0.45)', alignItems: 'center', justifyContent: 'center' },
  side: { flex: 1 },
  under: {},
  actions: { flexDirection: 'row', gap: 18 },
  action: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  remove: { color: colors.danger },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  error: { fontSize: 12, color: colors.danger, marginTop: 4, lineHeight: 17 },
});
