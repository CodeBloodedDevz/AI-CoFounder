import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

const TYPES = [
  { key: 'sale', label: 'Sale' },
  { key: 'expense', label: 'Expense' },
  { key: 'stock_purchase', label: 'Stock Purchase' },
];

const PAYMENT_METHODS = [
  { key: 'Cash', label: '💵 Cash' },
  { key: 'Card', label: '💳 Card' },
  { key: 'EFT', label: 'EFT' },
];

export default function RecordTransactionScreen({ route, navigation }) {
  const { addTransaction, state } = useApp();
  const { t } = useTranslation();
  const params = route.params || {};

  const [type, setType] = useState(params.type || 'sale');
  const [product, setProduct] = useState(params.product || '');
  const [quantity, setQuantity] = useState(params.quantity ? String(params.quantity) : '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [listening, setListening] = useState(false);

  // Support being navigated to with fresh params (e.g. tapping "Record" on a
  // restock suggestion) even if this tab is already mounted.
  useEffect(() => {
    if (params.type) setType(params.type);
    if (params.product) setProduct(params.product);
    if (params.quantity) setQuantity(String(params.quantity));
  }, [params.type, params.product, params.quantity]);

  const handleSave = () => {
    addTransaction({
      type,
      product,
      quantity: Number(quantity || 0),
      amount: Number(amount || 0),
      method,
      date: new Date().toISOString().slice(0, 10),
    });
    setProduct('');
    setQuantity('');
    setAmount('');
    navigation.navigate('Dashboard');
  };

  const handleVoice = () => {
    setListening(true);
    setTimeout(() => setListening(false), 900);
  };

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('recordTransaction')}</Text>
      </View>

      <View style={styles.chipRow}>
        {TYPES.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setType(opt.key)}
            style={[styles.chip, type === opt.key ? styles.chipActive : styles.chipOutline]}
          >
            <Text style={[styles.chipText, type === opt.key && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <Select
        label="Product"
        placeholder="Select a product"
        options={state.products.map((p) => p.name)}
        value={product}
        onChange={setProduct}
      />
      <Input label="Quantity" keyboardType="numeric" placeholder="3" value={quantity} onChangeText={setQuantity} />
      <Input label="Amount (Total)" keyboardType="decimal-pad" placeholder="R45.00" value={amount} onChangeText={setAmount} />

      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.chipRow}>
        {PAYMENT_METHODS.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMethod(m.key)}
            style={[styles.chip, method === m.key ? styles.chipActive : styles.chipOutline]}
          >
            <Text style={[styles.chipText, method === m.key && styles.chipTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <Button onPress={handleSave} disabled={!product || !quantity || !amount}>
        {t('saveTransaction')}
      </Button>
      <View style={{ height: 12 }} />
      <Button variant="outline-accent" onPress={handleVoice}>
        {listening ? '🎙️ Listening…' : `🎙️ ${t('sayTransaction')}`}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { flex: 1, borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center' },
  chipOutline: { borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
});
