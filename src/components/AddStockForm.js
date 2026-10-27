import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Input from './Input';
import Button from './Button';
import Banner from './Banner';
import { useBanner } from './useBanner';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { parseAmount } from '../lib/numbers';
import { colors, radius } from '../theme';

// "Add new stock": adds units to a product you already have, or creates the product the first time.
// The purchase is logged as an expense (that is what the server's /products/restock does).
//   prefill = { id, product, quantity } fills the form (e.g. from the restock plan); a new id re-fills it.
export default function AddStockForm({ prefill, onSaved }) {
  const { state, addStock } = useApp();
  const { t, formatNumber, formatMoney, currencySymbol } = useTranslation();
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { banner, show, clear } = useBanner(5000);

  useEffect(() => {
    if (!prefill?.id) return;
    setProduct(prefill.product || '');
    setQuantity(prefill.quantity ? String(prefill.quantity) : '');
    setAmount('');
    setErrors({});
    clear();
  }, [prefill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The server matches names ignoring upper / lower case, so tell the person which it will be.
  const existing = useMemo(() => {
    const wanted = product.trim().toLowerCase();
    return wanted ? state.products.find((p) => p.name.trim().toLowerCase() === wanted) : null;
  }, [product, state.products]);

  const qty = parseAmount(quantity);
  const total = parseAmount(amount);
  const unit = qty > 0 && total !== null && total >= 0 ? total / qty : null;

  const save = async () => {
    if (saving) return;
    const next = {};
    if (!product.trim()) next.product = t('stock.errProduct');
    if (qty === null || qty <= 0) next.quantity = t('stock.errQuantity');
    if (total === null || total < 0) next.amount = t('stock.errAmount');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const result = await addStock({ product: product.trim(), quantity: qty, amount: total });
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || t('sync.couldnTAddTheStock'));
    const saved = result.data?.product;
    show(
      'success',
      result.data?.created
        ? t('stock.addedNew', { name: saved?.name || product.trim(), qty: formatNumber(qty), price: formatMoney(saved?.price ?? 0) })
        : t('stock.addedExisting', { name: saved?.name || product.trim(), qty: formatNumber(qty), stock: formatNumber(saved?.stock ?? 0) })
    );
    setProduct('');
    setQuantity('');
    setAmount('');
    onSaved?.(saved);
  };

  const set = (setter, key) => (v) => {
    setter(v);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('common.addNewStock')}</Text>
      <Banner type={banner?.type} text={banner?.text} onClose={clear} />
      <Input
        label={t('common.product')}
        placeholder={t('stock.productPlaceholder')}
        value={product}
        onChangeText={set(setProduct, 'product')}
        error={errors.product}
        hint={
          product.trim()
            ? existing
              ? t('stock.willAddTo', { name: existing.name, stock: formatNumber(existing.stock) })
              : t('stock.willCreate')
            : undefined
        }
      />
      <View style={styles.row}>
        <Input
          style={styles.half}
          label={t('common.quantity')}
          placeholder="0"
          keyboardType="decimal-pad"
          value={quantity}
          onChangeText={set(setQuantity, 'quantity')}
          error={errors.quantity}
        />
        <Input
          style={styles.half}
          label={t('stock.totalPaid')}
          placeholder={`${currencySymbol} 0.00`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={set(setAmount, 'amount')}
          error={errors.amount}
        />
      </View>
      {unit !== null && !errors.amount && !errors.quantity ? (
        <Text style={styles.note}>{t('stock.unitCost', { amount: formatMoney(unit) })}</Text>
      ) : null}
      <Button size="sm" icon="add" onPress={save} loading={saving} disabled={saving}>
        {t('common.addStock')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, marginBottom: 18 },
  title: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  note: { fontSize: 12, color: colors.textMuted, marginTop: -8, marginBottom: 12 },
});
