import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import Input from './Input';
import Button from './Button';
import Banner from './Banner';
import ConfirmDialog from './ConfirmDialog';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { parseAmount } from '../lib/numbers';
import { stockStatus } from '../lib/aiEngine';
import { colors } from '../theme';

const toForm = (p) => ({
  name: p?.name || '',
  category: p?.category || '',
  price: p ? String(p.price ?? '') : '',
  cost: p ? String(p.cost ?? '') : '',
  lowStockThreshold: p ? String(p.lowStockThreshold ?? '') : '',
  stock: p ? String(p.stock ?? '') : '',
});

// Edit a product's details: name, category, selling price, cost, low-stock level and the stock count
// (a stock-take correction). Also where a product is deleted (with a confirmation).
export default function ProductEditSheet({ product, visible, onClose, navigation }) {
  const { state, updateProduct, deleteProduct } = useApp();
  const { t, formatNumber, currencySymbol } = useTranslation();
  const [form, setForm] = useState(toForm(product));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(toForm(product));
      setErrors({});
      setProblem('');
    }
  }, [visible, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null;
  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = async () => {
    const next = {};
    const name = form.name.replace(/\s+/g, ' ').trim();
    const price = parseAmount(form.price);
    const cost = parseAmount(form.cost);
    const low = parseAmount(form.lowStockThreshold);
    const stock = parseAmount(form.stock);
    if (!name) next.name = t('productEdit.errName');
    else if (state.products.some((p) => p.id !== product.id && p.name.trim().toLowerCase() === name.toLowerCase())) next.name = t('productEdit.errDuplicate');
    if (price === null || price <= 0) next.price = t('productEdit.errPrice');
    if (cost === null || cost < 0) next.cost = t('productEdit.errNumber');
    if (low === null || low < 0) next.lowStockThreshold = t('productEdit.errNumber');
    if (stock === null || stock < 0) next.stock = t('productEdit.errNumber');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const result = await updateProduct(product.id, { name, category: form.category.trim() || 'Other', price, cost, lowStockThreshold: low, stock });
    setSaving(false);
    if (!result?.ok) return setProblem(result?.error || t('sync.couldntUpdateProduct'));
    onClose();
  };

  const remove = async () => {
    setDeleting(true);
    const result = await deleteProduct(product.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (!result?.ok) return setProblem(result?.error || t('sync.couldnTDeleteTheProduct'));
    onClose();
  };

  const price = parseAmount(form.price);
  const cost = parseAmount(form.cost);
  const margin = price > 0 && cost !== null && cost >= 0 ? Math.round(((price - cost) / price) * 100) : null;
  const status = stockStatus(product);

  return (
    <BottomSheet visible={visible} title={t('productEdit.title')} onClose={onClose}>
      <Banner type="error" text={problem} onClose={() => setProblem('')} />
      <Input label={t('productEdit.name')} value={form.name} onChangeText={set('name')} error={errors.name} />
      <Input label={t('common.category')} placeholder={t('productEdit.categoryPlaceholder')} value={form.category} onChangeText={set('category')} />
      <View style={styles.row}>
        <Input style={styles.half} label={t('productEdit.sellingPrice', { symbol: currencySymbol })} keyboardType="decimal-pad" value={form.price} onChangeText={set('price')} error={errors.price} />
        <Input style={styles.half} label={t('productEdit.costPrice', { symbol: currencySymbol })} keyboardType="decimal-pad" value={form.cost} onChangeText={set('cost')} error={errors.cost} />
      </View>
      {margin !== null ? (
        <Text style={[styles.note, margin < 0 && { color: colors.danger }]}>
          {margin < 0 ? t('productEdit.sellingAtLoss') : t('productEdit.margin', { pct: margin })}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Input
          style={styles.half}
          label={t('productEdit.inStock')}
          keyboardType="decimal-pad"
          value={form.stock}
          onChangeText={set('stock')}
          error={errors.stock}
          hint={t('productEdit.stockHint')}
        />
        <Input
          style={styles.half}
          label={t('productEdit.lowStockAt')}
          keyboardType="decimal-pad"
          value={form.lowStockThreshold}
          onChangeText={set('lowStockThreshold')}
          error={errors.lowStockThreshold}
          hint={t('productEdit.lowStockHint')}
        />
      </View>
      {status !== 'GOOD' ? (
        <Text style={[styles.note, { color: status === 'OUT' ? colors.danger : colors.warning }]}>
          {status === 'OUT' ? t('productEdit.isOut') : t('productEdit.isLow', { stock: formatNumber(product.stock) })}
        </Text>
      ) : null}

      <Button onPress={save} loading={saving} disabled={saving || deleting}>{t('saveChanges')}</Button>

      <View style={styles.links}>
        {navigation ? (
          <Pressable
            onPress={() => {
              onClose();
              navigation.navigate('PricingAssistant', { productId: product.id });
            }}
            style={styles.link}
            accessibilityRole="button"
          >
            <Icon name="cash-outline" size={15} color={colors.primary} />
            <Text style={styles.linkText}>{t('aiPricingAssistant')}</Text>
          </Pressable>
        ) : <View />}
        <Pressable onPress={() => setConfirmDelete(true)} style={styles.link} accessibilityRole="button">
          <Icon name="trash-outline" size={15} color={colors.danger} />
          <Text style={[styles.linkText, { color: colors.danger }]}>{t('productEdit.delete')}</Text>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title={t('productEdit.deleteTitle')}
        message={t('productEdit.deleteBody', { name: product.name })}
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  note: { fontSize: 12.5, color: colors.textMuted, marginTop: -6, marginBottom: 14, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
