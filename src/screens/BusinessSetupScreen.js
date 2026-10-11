import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import LocationInput from '../components/LocationInput';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import { useApp } from '../context/AppContext';
import { LANGUAGES, TRANSLATIONS } from '../i18n/translations';
import { colors, radius } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';

const BUSINESS_TYPES = ['Spaza Shop', 'Hair Salon', 'Street Vendor', 'Tailoring', 'Tuck Shop', 'Other'];
const BUSINESS_MODELS = [
  { value: 'Product-based', label: 'Product' },
  { value: 'Service-based', label: 'Service' },
  { value: 'Hybrid', label: 'Hybrid' },
];
const CURRENCIES = ['South African Rand (R)', 'US Dollar ($)', 'Euro (€)', 'British Pound (£)'];

const MODEL_HELP = {
  'Product-based': {
    title: 'Product tracks what you sell',
    body: 'Track stock levels, sales and pricing for physical items.',
  },
  'Service-based': {
    title: 'Service tracks what you offer',
    body: 'Manage services, bookings and customers in one place.',
  },
  Hybrid: {
    title: 'Hybrid combines products and services',
    body: 'Track stock, services and customers in one place.',
  },
};

export default function BusinessSetupScreen({ navigation }) {
  const { saveBusiness, state, logout } = useApp();
  const isEditMode = !!state.business;

  const [form, setForm] = useState({
    name: state.business?.name || '',
    type: state.business?.type || '',
    businessModel: state.business?.businessModel || 'Product-based',
    currency: state.business?.currency || 'South African Rand (R)',
    products: state.business?.products || '',
    location: state.business?.location || '',
    hours: state.business?.hours || '',
    goals: state.business?.goals || '',
    language: state.business?.language || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const dict = TRANSLATIONS[form.language] || TRANSLATIONS.English;
  const t = (key) => dict[key] ?? TRANSLATIONS.English[key] ?? key;

  // CHANGED: saveBusiness() now hits the backend and can fail (e.g. phone
  // and laptop not on the same Wi-Fi, server not running), so we wait for
  // it and only navigate on success — otherwise the person is shown why.
  const handleSubmit = async () => {
    setLoading(true);
    const wasEditing = isEditMode;
    const result = await saveBusiness(form);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');

    if (wasEditing && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  const help = MODEL_HELP[form.businessModel] || MODEL_HELP['Product-based'];

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        {isEditMode && <BackButton navigation={navigation} />}
        <Text style={styles.title}>{isEditMode ? t('editBusinessTitle') : t('businessSetupTitle')}</Text>
        <Text style={styles.subtitle}>{isEditMode ? t('editBusinessSubtitle') : t('businessSetupSubtitle')}</Text>
        {!isEditMode && (
          <Pressable onPress={() => logout()} style={{ marginTop: 10 }}>
            <Text style={styles.logoutLink}>Not you? Log out</Text>
          </Pressable>
        )}
      </View>

      <Select
        icon="globe-outline"
        label={t('preferredLanguage')}
        placeholder={t('preferredLanguage')}
        options={LANGUAGES}
        value={form.language}
        onChange={set('language')}
      />
      <View style={styles.languageHintRow}><Icon name="globe-outline" size={14} color={colors.textMuted} /><Text style={styles.languageHint}>{t('preferredLanguageHint')}</Text></View>

      <Input label={t('businessName')} placeholder="E.g. Thando's Spaza" value={form.name} onChangeText={set('name')} />

      <Text style={styles.label}>Business mode</Text>
      <SegmentedControl options={BUSINESS_MODELS} value={form.businessModel} onChange={set('businessModel')} />

      <Select
        label="Category"
        placeholder="Select category"
        options={BUSINESS_TYPES}
        value={form.type}
        onChange={set('type')}
      />
      <Select
        label="Currency"
        placeholder="Select currency"
        options={CURRENCIES}
        value={form.currency}
        onChange={set('currency')}
      />

      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>{help.title}</Text>
        <Text style={styles.helpBody}>{help.body}</Text>
      </View>

      <Input
        label={t('productsServices')}
        placeholder="What do you sell?"
        value={form.products}
        onChangeText={set('products')}
      />

      <LocationInput
        label={t('businessLocation')}
        placeholder="Start typing your address..."
        value={form.location}
        onChange={set('location')}
      />

      <Input label={t('operatingHours')} placeholder="E.g. 08:00 AM – 08:00 PM" value={form.hours} onChangeText={set('hours')} />

      <Input
        label="Business goals"
        placeholder="E.g. Grow monthly revenue, open a second branch"
        value={form.goals}
        onChangeText={set('goals')}
      />

      {error ? <Text style={styles.error}><Icon name="warning-outline" size={15} color={colors.danger} /> {error}</Text> : null}

      <Button onPress={handleSubmit} loading={loading} disabled={loading}>
        {isEditMode ? t('saveChanges') : 'Finish Setup'}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  languageHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -10, marginBottom: 18 },
  languageHint: { fontSize: 12, color: colors.textMuted },
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
