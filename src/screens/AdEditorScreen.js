import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Input from '../components/Input';
import TextArea from '../components/TextArea';
import Select from '../components/Select';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Icon from '../components/Icon';
import ImagePickerField from '../components/ImagePickerField';
import SponsoredAdCard from '../components/SponsoredAdCard';
import { Card, Pill, SectionLabel } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import { useSponsoredApi, CATEGORY_IDS, openCheckout, trackAdPayment } from '../lib/sponsored';

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 280;

// Create, edit or renew an advert.
//   route params: {}                 new advert: content, package, then pay (or use the Premium allowance)
//                 { adId }           edit: content only (a live advert's changes wait for approval)
//                 { renewFrom: id }  renew: same content, choose a new package
// Prices and what each package includes come from the server; the app never sends an amount.
export default function AdEditorScreen({ navigation, route }) {
  const { t, formatMoney, formatDate } = useTranslation();
  const api = useSponsoredApi();
  const adId = route.params?.adId || null;
  const renewFrom = route.params?.renewFrom || null;
  const mode = adId ? 'edit' : renewFrom ? 'renew' : 'create';

  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(null);
  const [existing, setExisting] = useState(null);
  const [fields, setFields] = useState({ title: '', description: '', imageUrl: '', category: '' });
  const [choice, setChoice] = useState(null); // package id, or 'included'
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const source = adId || renewFrom;
      const [m, p, a] = await Promise.all([api.meta(), api.profile(), source ? api.myAd(source) : Promise.resolve(null)]);
      if (!m.ok) return setLoadError(m.error);
      setMeta(m.data);
      if (p.ok) setPage(p.data.profile.current);
      if (a) {
        if (!a.ok) return setLoadError(a.error);
        setExisting(a.data);
        const shown = { ...a.data, ...(a.data.revision?.status === 'pending' ? mapChanges(a.data.revision.changes) : {}) };
        setFields({ title: shown.title, description: shown.description, imageUrl: shown.imageUrl || '', category: shown.category });
      } else if (p.ok && p.data.profile.current?.category) {
        setFields((f) => ({ ...f, category: p.data.profile.current.category }));
      }
      const e = m.data.eligibility;
      if (!adId) setChoice(e.includedAvailable > 0 ? 'included' : e.canPurchase ? m.data.packages[0]?.id || null : null);
    })();
  }, [api, adId, renewFrom]);

  const set = (k) => (v) => {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: null }));
  };

  const rand = (n) => formatMoney(n, { symbol: 'R', decimals: Number.isInteger(Number(n)) ? 0 : 2 });
  const selected = choice === 'included' ? meta?.includedPackage : meta?.packages.find((p) => p.id === choice);
  const price = choice === 'included' ? 0 : selected?.price || 0;

  const previewAd = useMemo(() => ({
    id: 'preview',
    title: fields.title || t('sponsored.editor.titlePlaceholder'),
    description: fields.description || t('sponsored.editor.descriptionPlaceholder'),
    imageUrl: fields.imageUrl || null,
    category: fields.category || 'other',
    placement: mode === 'edit' ? existing?.placement || 'standard' : selected?.placement || 'standard',
    business: { name: page?.displayName || '', logoUrl: page?.logoUrl || null },
  }), [fields, page, selected, mode, existing, t]);

  const validate = () => {
    const e = {};
    if (mode !== 'renew') {
      if (fields.title.trim().length < 3) e.title = t('sponsored.editor.titleRequired');
      if (fields.description.trim().length < 20) e.description = t('sponsored.editor.descriptionRequired');
      if (!fields.category) e.category = t('sponsored.editor.categoryRequired');
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    setBanner(null);
    if (!validate()) return;
    if (mode !== 'edit' && !choice) return setBanner({ type: 'error', text: t('sponsored.editor.choosePackage') });
    setSaving(true);
    const content = { title: fields.title.trim(), description: fields.description.trim(), imageUrl: fields.imageUrl || null, category: fields.category };
    const funding = choice === 'included' ? { useIncluded: true } : { packageId: choice };

    if (mode === 'edit') {
      const r = await api.editAd(adId, { ...content, resubmit: existing?.status === 'rejected' });
      setSaving(false);
      if (!r.ok) return setBanner({ type: 'error', text: r.error });
      navigation.goBack();
      return;
    }

    const r = mode === 'renew' ? await api.renew(renewFrom, funding) : await api.createAd({ ...content, ...funding });
    setSaving(false);
    if (!r.ok) {
      if (r.code === 'profile_incomplete') return setBanner({ type: 'error', text: r.error, action: 'page' });
      if (r.code === 'upgrade_required') return setBanner({ type: 'error', text: r.error, action: 'plans' });
      return setBanner({ type: 'error', text: r.error });
    }
    if (r.data.checkout) {
      await trackAdPayment(r.data.checkout.reference, r.data.ad.id);
      navigation.navigate('MyAds');
      const opened = await openCheckout(r.data.checkout.authorizationUrl);
      if (!opened) setBanner({ type: 'error', text: t('sponsored.editor.couldntOpenPayment') });
      return;
    }
    // Premium allowance (no payment), or the payment couldn't start: the advert is saved either way.
    navigation.navigate('MyAds');
  };

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.editor.newTitle')} />
        <Banner type="error" text={loadError} />
      </Screen>
    );
  }
  if (!meta) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.editor.newTitle')} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  const e = meta.eligibility;
  const title = mode === 'edit' ? t('sponsored.editor.editTitle') : mode === 'renew' ? t('sponsored.editor.renewTitle') : t('sponsored.editor.newTitle');
  const liveEdit = mode === 'edit' && ['active', 'scheduled'].includes(existing?.status);
  const submitLabel = mode === 'edit'
    ? existing?.status === 'rejected' ? t('sponsored.editor.saveResubmit') : liveEdit ? t('sponsored.editor.sendChanges') : t('sponsored.editor.save')
    : price > 0 ? t('sponsored.editor.pay', { amount: rand(price) }) : t('sponsored.editor.submitIncluded');

  return (
    <Screen>
      <ScreenHeader navigation={navigation} title={title} />

      {banner ? (
        <View>
          <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} />
          {banner.action === 'page' ? <Button size="sm" variant="outline-accent" fullWidth={false} onPress={() => navigation.navigate('BusinessPageEditor')} style={styles.bannerAction}>{t('sponsored.myAds.setUpPage')}</Button> : null}
          {banner.action === 'plans' ? <Button size="sm" variant="outline-accent" fullWidth={false} onPress={() => navigation.navigate('Subscription')} style={styles.bannerAction}>{t('sponsored.plan.seePlans')}</Button> : null}
        </View>
      ) : null}
      {existing?.status === 'rejected' && existing.reviewNote ? (
        <Card tone="danger" style={styles.block}>
          <Text style={styles.noteTitle}>{t('sponsored.editor.rejectedTitle')}</Text>
          <Text style={styles.small}>{existing.reviewNote}</Text>
        </Card>
      ) : null}
      {liveEdit ? <Text style={[styles.small, styles.block]}>{t('sponsored.editor.liveEditNote')}</Text> : null}

      {mode !== 'renew' ? (
        <>
          <SectionLabel>{t('sponsored.editor.advert')}</SectionLabel>
          <ImagePickerField
            label={t('sponsored.editor.picture')}
            hint={t('sponsored.editor.pictureHint')}
            value={fields.imageUrl}
            onChange={set('imageUrl')}
            kind="banner"
            upload={api.upload}
          />
          <Input label={t('sponsored.editor.titleLabel')} value={fields.title} onChangeText={set('title')} placeholder={t('sponsored.editor.titlePlaceholder')} maxLength={TITLE_MAX} error={errors.title} />
          <TextArea label={t('sponsored.editor.descriptionLabel')} value={fields.description} onChangeText={set('description')} placeholder={t('sponsored.editor.descriptionPlaceholder')} maxLength={DESCRIPTION_MAX} error={errors.description} hint={t('sponsored.editor.descriptionHint')} />
          <Select
            label={t('sponsored.editor.category')}
            value={fields.category}
            onChange={set('category')}
            options={CATEGORY_IDS}
            renderOption={(id) => t(`sponsored.category.${id}`)}
            placeholder={t('sponsored.editor.categoryPlaceholder')}
          />
          {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}
        </>
      ) : null}

      <SectionLabel>{t('sponsored.editor.preview')}</SectionLabel>
      <SponsoredAdCard ad={previewAd} variant={previewAd.placement === 'standard' ? 'list' : 'featured'} style={styles.block} />

      {mode !== 'edit' ? (
        <>
          <SectionLabel>{t('sponsored.editor.package')}</SectionLabel>
          {e.includedPerMonth > 0 && meta.includedPackage ? (
            <PackageOption
              selected={choice === 'included'}
              disabled={e.includedAvailable <= 0}
              onPress={() => setChoice('included')}
              name={t('sponsored.package.premium_included')}
              price={t('sponsored.editor.included')}
              lines={[t('sponsored.editor.days', { count: meta.includedPackage.durationDays }), t('sponsored.placement.standard')]}
              note={e.includedAvailable > 0 ? t('sponsored.editor.includedNote') : t('sponsored.plan.includedUsedBody', { date: formatDate(e.includedRenewsOn) })}
              badge={t('sponsored.editor.premiumBadge')}
            />
          ) : null}
          {e.canPurchase ? meta.packages.map((p) => (
            <PackageOption
              key={p.id}
              selected={choice === p.id}
              onPress={() => setChoice(p.id)}
              name={pkgName(t, p)}
              price={rand(p.price)}
              lines={[t('sponsored.editor.days', { count: p.durationDays }), t(`sponsored.placement.${p.placement}`)]}
              note={t(`sponsored.placement.${p.placement}Body`)}
              badge={p.placement === 'featured' ? t('sponsored.editor.popular') : null}
            />
          )) : (
            <Card tone="low" style={styles.block}>
              <Text style={styles.small}>{t('sponsored.plan.freeBody')}</Text>
              <Button size="sm" fullWidth={false} onPress={() => navigation.navigate('Subscription')} style={{ marginTop: 10 }}>{t('sponsored.plan.seePlans')}</Button>
            </Card>
          )}

          {selected ? (
            <Card tone="low" style={styles.summary}>
              <SummaryRow icon="card-outline" text={price > 0 ? t('sponsored.editor.summaryPay', { amount: rand(price) }) : t('sponsored.editor.summaryIncluded')} />
              <SummaryRow icon="shield-checkmark-outline" text={t('sponsored.editor.summaryReview')} />
              <SummaryRow icon="calendar-outline" text={t('sponsored.editor.summaryRuns', { count: selected.durationDays })} />
              {mode === 'renew' ? <SummaryRow icon="refresh-outline" text={t('sponsored.editor.summaryRenew')} /> : null}
              {price > 0 ? <SummaryRow icon="lock-closed-outline" text={t('sponsored.editor.summaryPaystack')} /> : null}
            </Card>
          ) : null}
          {price > 0 && !meta.payments.enabled ? <Banner type="error" text={t('sponsored.editor.paymentsOff')} /> : null}
        </>
      ) : null}

      <Button onPress={submit} loading={saving} disabled={mode !== 'edit' && (!choice || (price > 0 && !meta.payments.enabled))} icon={price > 0 && mode !== 'edit' ? 'lock-closed' : undefined}>
        {submitLabel}
      </Button>
      {mode !== 'edit' ? <Text style={styles.terms}>{t('sponsored.editor.terms')}</Text> : null}
    </Screen>
  );
}

const pkgName = (t, p) => (t.has(`sponsored.package.${p.id}`) ? t(`sponsored.package.${p.id}`) : p.name);
const mapChanges = (c = {}) => {
  const out = {};
  if (c.title !== undefined) out.title = c.title;
  if (c.description !== undefined) out.description = c.description;
  if (c.image_url !== undefined) out.imageUrl = c.image_url;
  if (c.category !== undefined) out.category = c.category;
  return out;
};

function PackageOption({ selected, disabled, onPress, name, price, lines, note, badge }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      style={[styles.pkg, selected && styles.pkgSelected, disabled && { opacity: 0.55 }]}
    >
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <View style={styles.pkgHead}>
          <Text style={styles.pkgName}>{name}</Text>
          {badge ? <Pill label={badge} tone="accent" /> : null}
        </View>
        <Text style={styles.pkgLines}>{lines.join(' · ')}</Text>
        {note ? <Text style={styles.pkgNote}>{note}</Text> : null}
      </View>
      <Text style={styles.pkgPrice}>{price}</Text>
    </Pressable>
  );
}

function SummaryRow({ icon, text }) {
  return (
    <View style={styles.summaryRow}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 20 },
  small: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  noteTitle: { fontSize: 14.5, fontWeight: '700', color: colors.danger, marginBottom: 4 },
  bannerAction: { marginTop: -6, marginBottom: 14 },
  fieldError: { fontSize: 12, color: colors.danger, marginTop: -10, marginBottom: 14 },
  pkg: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 10 },
  pkgSelected: { borderColor: colors.primary, backgroundColor: '#FBF6FF' },
  pkgHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pkgName: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  pkgLines: { fontSize: 12.5, color: colors.textSoft, marginTop: 3, fontWeight: '600' },
  pkgNote: { fontSize: 12.5, color: colors.textSoft, marginTop: 4, lineHeight: 18 },
  pkgPrice: { fontSize: 17, fontWeight: '800', color: colors.primaryDark },
  summary: { gap: 8, marginTop: 6, marginBottom: 18 },
  summaryRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  summaryText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  terms: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 12 },
});
