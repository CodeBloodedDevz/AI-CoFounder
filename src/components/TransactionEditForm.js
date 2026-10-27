import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Input from './Input';
import Button from './Button';
import Banner from './Banner';
import DateField from './DateField';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { parseAmount } from '../lib/numbers';
import { todayISO } from '../lib/schedule';
import { colors } from '../theme';

// Edits a recorded transaction: amount, description, category / item, date, note (and quantity for a sale
// typed in by hand). Income from a completed booking stays linked to its booking; its agreed price is shown
// so a tip or correction is easy to see.
export default function TransactionEditForm({ transaction, onDone, onCancel }) {
  const { updateTransaction } = useApp();
  const { t, formatMoney, currencySymbol } = useTranslation();
  const fromBooking = transaction.source === 'booking';
  const [form, setForm] = useState({
    amount: String(transaction.amount ?? ''),
    title: transaction.title || '',
    product: transaction.product || '',
    date: transaction.date || todayISO(),
    note: transaction.note || '',
    quantity: String(transaction.quantity ?? 1),
  });
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const amount = parseAmount(form.amount);
  const diff = fromBooking && transaction.bookingPrice > 0 && amount !== null ? amount - transaction.bookingPrice : 0;

  const save = async () => {
    if (saving) return;
    const next = {};
    const qty = parseAmount(form.quantity);
    if (amount === null || amount <= 0) next.amount = t('recordTransaction.errAmount');
    if (!form.title.trim() && !form.product.trim()) next.title = t('recordTransaction.errTitle');
    if (!form.date) next.date = t('schedule.errPickDate');
    if (transaction.type === 'sale' && !fromBooking && (qty === null || qty <= 0)) next.quantity = t('recordTransaction.errQuantity');
    setErrors(next);
    if (Object.keys(next).length) return;
    const fields = { amount, title: form.title.trim(), product: form.product.trim() || form.title.trim(), date: form.date, note: form.note.trim() };
    if (transaction.type === 'sale' && !fromBooking) fields.quantity = qty;
    setSaving(true);
    const result = await updateTransaction(transaction.id, fields);
    setSaving(false);
    if (!result?.ok) return setProblem(result?.error || t('sync.couldntUpdateTransaction'));
    onDone?.(result.data);
  };

  return (
    <View>
      <Banner type="error" text={problem} onClose={() => setProblem('')} />
      <Input
        label={t('recordTransaction.amount')}
        placeholder={`${currencySymbol} 0.00`}
        keyboardType="decimal-pad"
        value={form.amount}
        onChangeText={set('amount')}
        error={errors.amount}
        hint={
          fromBooking && transaction.bookingPrice > 0
            ? diff > 0
              ? t('transactions.bookingPriceTip', { price: formatMoney(transaction.bookingPrice), extra: formatMoney(diff) })
              : diff < 0
              ? t('transactions.bookingPriceLess', { price: formatMoney(transaction.bookingPrice), less: formatMoney(-diff) })
              : t('transactions.bookingPrice', { price: formatMoney(transaction.bookingPrice) })
            : undefined
        }
      />
      <Input label={t('transactions.description')} value={form.title} onChangeText={set('title')} error={errors.title} maxLength={160} />
      <Input
        label={transaction.type === 'sale' ? t('transactions.item') : t('common.category')}
        value={form.product}
        onChangeText={set('product')}
        maxLength={120}
        hint={transaction.type === 'sale' && !fromBooking ? t('transactions.itemHint') : undefined}
      />
      {transaction.type === 'sale' && !fromBooking ? (
        <Input label={t('common.quantity')} keyboardType="decimal-pad" value={form.quantity} onChangeText={set('quantity')} error={errors.quantity} />
      ) : null}
      <DateField label={t('common.date')} value={form.date} onChange={set('date')} maxDate={todayISO()} error={errors.date} />
      <Input label={t('transactions.note')} value={form.note} onChangeText={set('note')} maxLength={500} placeholder={fromBooking ? t('transactions.notePlaceholderTip') : ''} />
      {fromBooking ? <Text style={styles.linked}>{t('transactions.staysLinked')}</Text> : null}
      <Button onPress={save} loading={saving} disabled={saving}>{t('saveChanges')}</Button>
      <Button variant="outline-accent" onPress={onCancel} style={{ marginTop: 10 }} disabled={saving}>{t('common.cancel')}</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  linked: { fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: 14, lineHeight: 17 },
});
