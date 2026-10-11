import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import BackButton from '../components/BackButton';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

const EXPENSE_CATEGORIES = ['Stock purchase', 'Supplier payment', 'Rent', 'Utilities', 'Packaging', 'Equipment', 'Other'];

function todayLabel() {
  return new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function RecordTransactionScreen({ route, navigation }) {
  const { addTransaction, state } = useApp();
  const { t } = useTranslation();
  const params = route.params || {};
  const isServiceBusiness = state.business?.businessModel === 'Service-based';
  const itemOptions = isServiceBusiness
    ? state.services.map((s) => s.name)
    : [...state.products.map((p) => p.name), ...state.services.map((s) => s.name)];

  const [type, setType] = useState(params.type === 'expense' ? 'expense' : 'sale');
  const [title, setTitle] = useState(params.product || '');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(params.product || '');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (params.type) setType(params.type === 'expense' ? 'expense' : 'sale');
    if (params.product) {
      setTitle(params.product);
      setCategory(params.product);
    }
  }, [params.type, params.product]);

  const categoryOptions = type === 'sale' ? itemOptions : EXPENSE_CATEGORIES;

  const handleSave = () => {
    addTransaction({
      type,
      product: category || title,
      quantity: 1,
      amount: Number(amount || 0),
      date: new Date().toISOString().slice(0, 10),
      title: title || category,
      note,
    });
    setTitle('');
    setAmount('');
    setCategory('');
    setNote('');
    navigation.goBack();
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('recordTransaction')}</Text>
        <Text style={styles.subtitle}>Add a new income or expense</Text>
      </View>

      <SegmentedControl
        options={[
          { value: 'sale', label: 'Income' },
          { value: 'expense', label: 'Expense' },
        ]}
        value={type}
        onChange={setType}
      />

      <Input label="Title" placeholder="Enter title" value={title} onChangeText={setTitle} />
      <Input label="Amount" placeholder="R 0.00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Select
        label="Category"
        placeholder="Select category"
        options={categoryOptions}
        value={category}
        onChange={setCategory}
      />
      <Input label="Date" value={todayLabel()} editable={false} />
      <Input label="Notes (optional)" placeholder="Add a note" value={note} onChangeText={setNote} />

      <View style={{ height: 8 }} />
      <Button onPress={handleSave} disabled={!title || !amount}>
        Save Transaction
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
});
