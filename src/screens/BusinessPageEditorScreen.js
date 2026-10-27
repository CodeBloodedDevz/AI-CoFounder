import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Input from '../components/Input';
import TextArea from '../components/TextArea';
import Select from '../components/Select';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Icon from '../components/Icon';
import ImagePickerField from '../components/ImagePickerField';
import { Card, SectionLabel } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import { useSponsoredApi, CATEGORY_IDS, profileProblemKeys, displayPhone } from '../lib/sponsored';

const MAX_OFFERINGS = 20;
const TEXT_FIELDS = ['displayName', 'about', 'category', 'location', 'hours', 'whatsapp', 'phone', 'email', 'website', 'instagram', 'facebook', 'logoUrl'];

// The business page people see after tapping "Learn More". It starts from what the business already saved in
// the app (name, location, hours, products and services). Saved changes are checked by an admin before anyone
// sees them; the approved page stays up meanwhile.
export default function BusinessPageEditorScreen({ navigation }) {
  const { t, formatMoney } = useTranslation();
  const api = useSponsoredApi();
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await api.profile();
      if (!r.ok) return setLoadError(r.error);
      const { profile, prefill } = r.data;
      const start = profile.current || prefill;
      setForm({
        ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, start[k] || ''])),
        whatsapp: start.whatsapp ? displayPhone(start.whatsapp) : '',
        phone: start.phone ? displayPhone(start.phone) : '',
        offerings: (start.offerings || []).map((o) => ({ ...o, price: o.price == null ? '' : String(o.price) })),
      });
      setStatus(profile);
      setSuggestions(prefill.offerings || []);
    })();
  }, [api]);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const setOffering = (i, patch) => {
    setForm((f) => ({ ...f, offerings: f.offerings.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
    setDirty(true);
  };
  const addOffering = (o = { name: '', kind: 'service', price: '' }) => {
    setForm((f) => (f.offerings.length >= MAX_OFFERINGS ? f : { ...f, offerings: [...f.offerings, { ...o, price: o.price == null ? '' : String(o.price) }] }));
    setDirty(true);
  };
  const removeOffering = (i) => {
    setForm((f) => ({ ...f, offerings: f.offerings.filter((_, j) => j !== i) }));
    setDirty(true);
  };

  const payload = () => ({
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, String(form[k] || '').trim()])),
    offerings: form.offerings.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), kind: o.kind, price: String(o.price).trim() === '' ? null : String(o.price).replace(',', '.') })),
  });

  const save = async () => {
    setBanner(null);
    setSaving(true);
    const r = await api.saveProfile(payload());
    setSaving(false);
    if (!r.ok) return setBanner({ type: 'error', text: r.error });
    setStatus(r.data.profile);
    setDirty(false);
    const p = r.data.profile;
    setBanner({ type: 'success', text: !p.hasChanges ? t('sponsored.page.savedNoChanges') : p.reviewStatus === 'pending' ? t('sponsored.page.savedForReview') : t('sponsored.page.savedWithNextAd') });
  };

  const preview = () => {
    const p = payload();
    const digits = (v) => {
      const d = String(v || '').replace(/\D/g, '');
      return /^0\d{9}$/.test(d) ? `27${d.slice(1)}` : d;
    };
    navigation.navigate('SponsoredBusiness', {
      preview: {
        ad: { id: 'preview', title: t('sponsored.page.previewAdTitle'), description: t('sponsored.page.previewAdBody'), imageUrl: null, category: p.category || 'other', placement: 'standard', business: { name: p.displayName, logoUrl: p.logoUrl || null } },
        business: {
          name: p.displayName || t('sponsored.myAds.pageNotSetUp'),
          about: p.about,
          logoUrl: p.logoUrl || null,
          category: p.category || null,
          location: p.location || null,
          hours: p.hours || null,
          website: p.website ? (/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`) : null,
          whatsapp: p.whatsapp ? digits(p.whatsapp) : null,
          whatsappUrl: p.whatsapp ? `https://wa.me/${digits(p.whatsapp)}` : null,
          phone: p.phone ? `+${digits(p.phone)}` : null,
          email: p.email || null,
          instagram: p.instagram || null,
          facebook: p.facebook || null,
          offerings: p.offerings.map((o) => ({ ...o, price: o.price == null ? null : Number(o.price) })),
        },
      },
    });
  };

  if (!form) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.page.title')} />
        {loadError ? <Banner type="error" text={loadError} /> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const problems = profileProblemKeys(form);
  const unused = suggestions.filter((s) => !form.offerings.some((o) => o.name.trim().toLowerCase() === s.name.toLowerCase()));
  const rand = (n) => formatMoney(n, { symbol: 'R', decimals: Number.isInteger(Number(n)) ? 0 : 2 });

  return (
    <Screen>
      <ScreenHeader navigation={navigation} title={t('sponsored.page.title')} subtitle={t('sponsored.page.subtitle')} />
      {banner ? <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} /> : null}
      {status?.reviewStatus === 'rejected' && status.reviewNote ? (
        <Card tone="danger" style={styles.block}>
          <Text style={styles.noteTitle}>{t('sponsored.page.rejectedTitle')}</Text>
          <Text style={styles.small}>{status.reviewNote}</Text>
        </Card>
      ) : null}
      {status?.reviewStatus === 'pending' && !dirty ? <Text style={[styles.small, styles.block]}>{t('sponsored.page.inReview')}</Text> : null}

      <SectionLabel>{t('sponsored.page.identity')}</SectionLabel>
      <ImagePickerField kind="logo" label={t('sponsored.page.logo')} hint={t('sponsored.page.logoHint')} value={form.logoUrl} onChange={set('logoUrl')} upload={api.upload} />
      <Input label={t('sponsored.page.name')} value={form.displayName} onChangeText={set('displayName')} maxLength={80} hint={t('sponsored.page.nameHint')} />
      <Select label={t('sponsored.editor.category')} value={form.category} onChange={set('category')} options={CATEGORY_IDS} renderOption={(id) => t(`sponsored.category.${id}`)} placeholder={t('sponsored.editor.categoryPlaceholder')} />
      <TextArea label={t('sponsored.page.about')} value={form.about} onChangeText={set('about')} maxLength={1200} minHeight={130} placeholder={t('sponsored.page.aboutPlaceholder')} hint={t('sponsored.page.aboutHint')} />
      <Input label={t('sponsored.page.location')} icon="location-outline" value={form.location} onChangeText={set('location')} maxLength={200} />
      <Input label={t('sponsored.page.hours')} icon="time-outline" value={form.hours} onChangeText={set('hours')} maxLength={200} placeholder={t('sponsored.page.hoursPlaceholder')} />

      <SectionLabel>{t('sponsored.page.contact')}</SectionLabel>
      <Text style={[styles.small, { marginBottom: 12 }]}>{t('sponsored.page.contactHint')}</Text>
      <Input label={t('sponsored.business.whatsapp')} icon="logo-whatsapp" value={form.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" placeholder="082 123 4567" />
      <Input label={t('sponsored.business.phone')} icon="call-outline" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="011 123 4567" />
      <Input label={t('sponsored.business.email')} icon="mail-outline" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Input label={t('sponsored.business.website')} icon="globe-outline" value={form.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" placeholder="mybusiness.co.za" />
      <Input label="Instagram" icon="logo-instagram" value={form.instagram} onChangeText={set('instagram')} keyboardType="url" autoCapitalize="none" placeholder="instagram.com/mybusiness" />
      <Input label="Facebook" icon="logo-facebook" value={form.facebook} onChangeText={set('facebook')} keyboardType="url" autoCapitalize="none" placeholder="facebook.com/mybusiness" />

      <SectionLabel>{t('sponsored.page.offerings')}</SectionLabel>
      <Text style={[styles.small, { marginBottom: 12 }]}>{t('sponsored.page.offeringsHint')}</Text>
      {form.offerings.map((o, i) => (
        <View key={i} style={styles.offering}>
          <View style={styles.offeringTop}>
            <TextInput style={[styles.inputBox, { flex: 1 }]} value={o.name} onChangeText={(v) => setOffering(i, { name: v })} placeholder={t('sponsored.page.itemName')} placeholderTextColor={colors.textMuted} maxLength={80} accessibilityLabel={t('sponsored.page.itemName')} />
            <Pressable onPress={() => removeOffering(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('sponsored.page.removeItem')}>
              <Icon name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.offeringBottom}>
            <TextInput style={[styles.inputBox, { width: 110 }]} value={o.price} onChangeText={(v) => setOffering(i, { price: v })} placeholder={t('sponsored.page.priceOptional')} placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" accessibilityLabel={t('common.price')} />
            {['service', 'product'].map((k) => (
              <Pressable key={k} onPress={() => setOffering(i, { kind: k })} style={[styles.kind, o.kind === k && styles.kindActive]} accessibilityRole="radio" accessibilityState={{ checked: o.kind === k }}>
                <Text style={[styles.kindText, o.kind === k && styles.kindTextActive]}>{t(`sponsored.page.kind.${k}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {form.offerings.length < MAX_OFFERINGS ? (
        <Button size="sm" variant="outline-accent" icon="add" fullWidth={false} onPress={() => addOffering()} style={{ marginBottom: 12 }}>{t('sponsored.page.addItem')}</Button>
      ) : null}
      {unused.length && form.offerings.length < MAX_OFFERINGS ? (
        <View style={styles.block}>
          <Text style={styles.suggestTitle}>{t('sponsored.page.fromRecords')}</Text>
          <View style={styles.suggestions}>
            {unused.slice(0, 12).map((s) => (
              <Pressable key={`${s.kind}-${s.name}`} onPress={() => addOffering(s)} style={styles.suggestion} accessibilityRole="button" accessibilityLabel={t('sponsored.page.addNamed', { name: s.name })}>
                <Icon name="add" size={14} color={colors.primary} />
                <Text style={styles.suggestionText}>{s.name}{s.price != null ? ` · ${rand(s.price)}` : ''}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : <View style={{ height: 8 }} />}

      {problems.length ? (
        <Card tone="low" style={styles.block}>
          <Text style={styles.noteTitleNeutral}>{t('sponsored.page.stillNeeded')}</Text>
          {problems.map((k) => <Text key={k} style={styles.small}>• {t(k)}</Text>)}
        </Card>
      ) : null}

      <Button onPress={save} loading={saving} icon="checkmark">{t('sponsored.page.save')}</Button>
      <Button variant="outline" icon="eye-outline" onPress={preview} style={{ marginTop: 10 }}>{t('sponsored.page.preview')}</Button>
      <Text style={styles.terms}>{t('sponsored.page.reviewNote')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 20 },
  small: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  noteTitle: { fontSize: 14.5, fontWeight: '700', color: colors.danger, marginBottom: 4 },
  noteTitleNeutral: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 6 },
  offering: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginBottom: 10, gap: 8 },
  offeringTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offeringBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputBox: { backgroundColor: colors.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text },
  kind: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  kindActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  kindText: { fontSize: 12.5, fontWeight: '600', color: colors.textSoft },
  kindTextActive: { color: colors.primaryDark },
  suggestTitle: { fontSize: 12.5, fontWeight: '700', color: colors.textSoft, marginBottom: 8 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceLow },
  suggestionText: { fontSize: 12.5, color: colors.primaryDark, fontWeight: '600' },
  terms: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 12 },
});
