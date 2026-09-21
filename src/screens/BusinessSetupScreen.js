import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import LocationInput from '../components/LocationInput';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { LANGUAGES, TRANSLATIONS } from '../i18n/translations';
import { colors } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';

const BUSINESS_TYPES = ['Spaza Shop', 'Hair Salon', 'Street Vendor', 'Tailoring', 'Tuck Shop', 'Other'];
const BUSINESS_MODELS = ['Product-based', 'Service-based', 'Hybrid'];

export default function BusinessSetupScreen({ navigation }) {
  const { saveBusiness, state } = useApp();
  const isEditMode = !!state.business;

  const [form, setForm] = useState({
    name: state.business?.name || '',
    type: state.business?.type || '',
    businessModel: state.business?.businessModel || '',
    products: state.business?.products || '',
    location: state.business?.location || '',
    hours: state.business?.hours || '',
    language: state.business?.language || '',
  });

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // Everything on this form re-translates live as soon as a language is
  // picked — that's why the language selector comes first: someone who
  // can't read English yet needs to choose their language before they can
  // understand the rest of the form.
  const dict = TRANSLATIONS[form.language] || TRANSLATIONS.English;
  const t = (key) => dict[key] ?? TRANSLATIONS.English[key] ?? key;

  const handleSubmit = () => {
    const wasEditing = isEditMode;
    saveBusiness(form);
    if (wasEditing && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 20 }}>
        {isEditMode && <BackButton navigation={navigation} />}
        <Text style={styles.title}>{isEditMode ? t('editBusinessTitle') : t('businessSetupTitle')}</Text>
        <Text style={styles.subtitle}>{isEditMode ? t('editBusinessSubtitle') : t('businessSetupSubtitle')}</Text>
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
      <Select
        label={t('businessType')}
        placeholder={t('businessType')}
        options={BUSINESS_TYPES}
        value={form.type}
        onChange={set('type')}
      />
      <Select
        label="Business model"
        placeholder="How does your business earn money?"
        options={BUSINESS_MODELS}
        value={form.businessModel}
        onChange={set('businessModel')}
      />
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

      <Button onPress={handleSubmit}>{isEditMode ? t('saveChanges') : t('createMyBusiness')}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  languageHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -10, marginBottom: 18 },
  languageHint: { fontSize: 12, color: colors.textMuted },
});
