import { useEffect, useRef, useState } from 'react';
import Banner from '../components/Banner';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import LocationInput from '../components/LocationInput';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import { useApp } from '../context/AppContext';
import { LANGUAGES, languageDisplayName } from '../i18n/languages';
import { colors, radius, type } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';
import { formFromBusiness, payloadFromForm, sameForm } from '../lib/businessForm';
import { useTranslation } from '../i18n/I18nContext';

const BUSINESS_TYPES = ['Spaza Shop', 'Hair Salon', 'Street Vendor', 'Tailoring', 'Tuck Shop', 'Other'];
const BUSINESS_MODELS = [
  { value: 'Product-based', label: 'Product' },
  { value: 'Service-based', label: 'Service' },
  { value: 'Hybrid', label: 'Hybrid' },
];
const CURRENCIES = ['South African Rand (R)', 'US Dollar ($)', 'Euro (€)', 'British Pound (£)'];

const MODEL_HELP = {
  'Product-based': {
    title: 'businessSetup.helpProductTitle',
    body: 'businessSetup.helpProductBody',
  },
  'Service-based': {
    title: 'businessSetup.helpServiceTitle',
    body: 'businessSetup.helpServiceBody',
  },
  Hybrid: {
    title: 'businessSetup.helpHybridTitle',
    body: 'businessSetup.helpHybridBody',
  },
};

export default function BusinessSetupScreen({ navigation, route }) {
  const { t, tv, setLanguage, languageLabel, language } = useTranslation();
  const { saveBusiness, state, logout } = useApp();
  const isEditMode = !!state.business;

  const [form, setForm] = useState(() => formFromBusiness(state.business, isEditMode));
  // What the form was last filled from the saved business: lets us tell untouched from edited.
  const seeded = useRef(form);
  const dirty = useRef(false);

  // If the saved business arrives or changes (a refresh, another device) while the person has not typed
  // anything yet, show it. Once they start editing we never overwrite their typing.
  useEffect(() => {
    const next = formFromBusiness(state.business, !!state.business);
    if (!dirty.current && !sameForm(next, seeded.current)) {
      seeded.current = next;
      setForm(next);
    }
  }, [state.business]);

  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const showError = (message) => {
    setError(message);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const set = (key) => (val) => {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: val }));
    if (key === 'name' && nameError) setNameError('');
  };

  // CHANGED: saveBusiness() now hits the backend and can fail (e.g. phone
  // and laptop not on the same Wi-Fi, server not running), so we wait for
  // it and only navigate on success — otherwise the person is shown why.
  const handleSubmit = async () => {
    if (loading) return;
    const name = form.name.replace(/\s+/g, ' ').trim();
    if (!name) {
      setNameError(t('businessSetup.nameRequired'));
      return showError(t('operations.fixFields'));
    }
    setError('');
    setLoading(true);
    const wasEditing = isEditMode;
    const payload = { ...payloadFromForm(form), name };
    // When editing, the language is managed on the Voice & Language page only: never send this form's
    // copy, so a language changed there in the meantime is not put back by saving these details.
    if (wasEditing) delete payload.language;
    const result = await saveBusiness(payload);
    setLoading(false);

    if (!result.ok) return showError(result.error);
    setError('');

    dirty.current = false;
    // Back to the Business Information page (showing the saved details) when that is where the edit started.
    const routes = navigation.getState?.()?.routes || [];
    const previous = routes[routes.length - 2]?.name;
    if (previous === 'BusinessInfo') {
      navigation.navigate('BusinessInfo', { savedAt: Date.now() });
    } else if (route?.params?.from === 'info') {
      navigation.replace('BusinessInfo', { savedAt: Date.now() }); // first save after being sent here from that page
    } else if (wasEditing && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  const help = MODEL_HELP[form.businessModel] || MODEL_HELP['Product-based'];

  return (
    <Screen scrollRef={scrollRef}>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        {isEditMode && <BackButton navigation={navigation} />}
        <Text style={styles.title}>{isEditMode ? t('editBusinessTitle') : t('businessSetupTitle')}</Text>
        <Text style={styles.subtitle}>{isEditMode ? t('editBusinessSubtitle') : t('businessSetupSubtitle')}</Text>
        {!isEditMode && (
          <Pressable onPress={() => logout()} style={{ marginTop: 10 }}>
            <Text style={styles.logoutLink}>{t('businessSetup.notYouLogOut')}</Text>
          </Pressable>
        )}
      </View>

      <Banner type="error" text={error} onClose={() => setError('')} />

      {isEditMode ? (
        // After setup the language is changed in one place only: Voice & Language.
        <Pressable onPress={() => navigation.navigate('VoiceLanguage')} accessibilityRole="button" style={styles.languageLink}>
          <Icon name="globe-outline" size={16} color={colors.primary} />
          <Text style={styles.languageLinkText}>{t('businessSetup.languageInVoice', { language: languageDisplayName(language) })}</Text>
          <Icon name="chevron-forward-outline" size={14} color={colors.primary} />
        </Pressable>
      ) : (
        <>
          {/* First setup: pick the language you read best before filling in the rest. */}
          <Select
            icon="globe-outline"
            label={t('preferredLanguage')}
            placeholder={t('businessSetup.selectYourLanguage')}
            options={LANGUAGES}
            renderOption={languageLabel}
            value={form.language}
            onChange={async (lang) => {
              set('language')(lang);
              // The whole app switches now. Nothing is saved until "Finish Setup".
              const r = await setLanguage(lang, { sync: false });
              if (r && r.ok === false && r.error) showError(r.error);
            }}
          />
          <View style={styles.languageHintRow}><Icon name="globe-outline" size={14} color={colors.textMuted} /><Text style={styles.languageHint}>{t('preferredLanguageHint')}</Text></View>
        </>
      )}

      <Input label={t('businessName')} placeholder={t('businessSetup.eGThandoSSpaza')} value={form.name} onChangeText={set('name')} error={nameError} maxLength={120} />

      <Text style={styles.label}>{t('businessSetup.businessMode')}</Text>
      <SegmentedControl options={BUSINESS_MODELS.map((o) => ({ ...o, label: tv('businessModel', o.value) }))} value={form.businessModel} onChange={set('businessModel')} />

      <Select
        label={t('common.category')}
        placeholder={t('businessSetup.selectYourBusinessCategory')}
        options={BUSINESS_TYPES}
        renderOption={(v) => tv('businessType', v)}
        value={form.type}
        onChange={set('type')}
      />
      <Select
        label={t('businessSetup.currency')}
        placeholder={t('businessSetup.selectYourCurrency')}
        options={CURRENCIES}
        renderOption={(v) => tv('currency', v)}
        value={form.currency}
        onChange={set('currency')}
      />

      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>{t(help.title)}</Text>
        <Text style={styles.helpBody}>{t(help.body)}</Text>
      </View>

      <Input
        label={t('productsServices')}
        placeholder={t('businessSetup.eGBreadAirtimeCold')}
        value={form.products}
        onChangeText={set('products')}
      />

      <LocationInput
        label={t('businessLocation')}
        placeholder={t('businessSetup.eG12VilakaziStreet')}
        value={form.location}
        onChange={set('location')}
      />

      <Input label={t('operatingHours')} placeholder={t('businessSetup.eG0800Am')} value={form.hours} onChangeText={set('hours')} />

      <Input
        label={t('businessSetup.businessGoals')}
        placeholder={t('businessSetup.eGGrowMonthlyRevenue')}
        value={form.goals}
        onChangeText={set('goals')}
      />


      <Button onPress={handleSubmit} loading={loading} disabled={loading}>
        {isEditMode ? t('saveChanges') : t('businessSetup.finishSetup')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: type.pageSubtitle,
  languageHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -10, marginBottom: 18 },
  languageHint: { fontSize: 12, color: colors.textMuted },
  languageLink: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18 },
  languageLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  helpCard: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
  },
  helpTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginBottom: 4 },
  helpBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, marginBottom: 14, fontWeight: '600' },
  logoutLink: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
