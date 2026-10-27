import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import Banner from '../components/Banner';
import DateField from '../components/DateField';
import SegmentedControl from '../components/SegmentedControl';
import BackButton from '../components/BackButton';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { parseAmount } from '../lib/numbers';
import { todayISO } from '../lib/schedule';
import { colors, radius, type } from '../theme';

const EXPENSE_CATEGORIES = ['Stock purchase', 'Supplier payment', 'Rent', 'Utilities', 'Packaging', 'Equipment', 'Other'];

// Record a sale (income) or an expense.
//   route.params: { type: 'sale' | 'expense', product?, quantity? }
// A sale of a product takes that many units off its stock (done by the server).
export default function RecordTransactionScreen({ route, navigation }) {
  const { addTransaction, state } = useApp();
  const { t, tv, currencySymbol, formatMoney, formatNumber } = useTranslation();
  const params = route.params || {};
  const isServiceBusiness = state.business?.businessModel === 'Service-based';

  // What can be sold: products (with stock and price) and services (with price).
  const items = useMemo(() => {
    const list = [];
    if (!isServiceBusiness) state.products.forEach((p) => list.push({ name: p.name, price: p.price, stock: p.stock, kind: 'product' }));
    state.services.forEach((s) => list.push({ name: s.name, price: s.price, kind: 'service' }));
    return list;
  }, [isServiceBusiness, state.products, state.services]);
  const findItem = (name) => items.find((i) => i.name === name);

  const [type, setType] = useState(params.type === 'expense' ? 'expense' : 'sale');
  const [title, setTitle] = useState(params.product || '');
  const [category, setCategory] = useState(params.product || '');
  const [quantity, setQuantity] = useState(params.quantity ? String(params.quantity) : '1');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  // The amount is filled in from the price until the person types their own.
  const amountTouched = useRef(false);

  useEffect(() => {
    if (params.type) setType(params.type === 'expense' ? 'expense' : 'sale');
    if (params.product) {
      setTitle(params.product);
      setCategory(params.product);
    }
    if (params.quantity) setQuantity(String(params.quantity));
  }, [params.type, params.product, params.quantity]);

  const changeType = (next) => {
    if (next === type) return;
    setType(next);
    // A product picked for a sale is not an expense category (and the other way round).
    setCategory('');
    setErrors({});
    amountTouched.current = false;
  };

  const selected = type === 'sale' ? findItem(category) : null;
  const qty = parseAmount(quantity);

  // Suggest the amount: price × quantity.
  useEffect(() => {
    if (type !== 'sale' || amountTouched.current || !selected || !(selected.price > 0)) return;
    const n = qty !== null && qty > 0 ? qty : 1;
    setAmount(String(Math.round(selected.price * n * 100) / 100));
  }, [type, selected?.name, selected?.price, qty]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCategory = (value) => {
    setCategory(value);
    if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
    // Use the product / service name as the title unless one was typed.
    if (type === 'sale' && (!title.trim() || findItem(title))) setTitle(value);
  };

  const handleSave = async () => {
    if (saving) return;
    const value = parseAmount(amount);
    const next = {};
    const label = title.trim() || category;
    if (!label) next.title = t('recordTransaction.errTitle');
    if (value === null || value <= 0) next.amount = t('recordTransaction.errAmount');
    if (type === 'sale' && (qty === null || qty <= 0)) next.quantity = t('recordTransaction.errQuantity');
    if (!date) next.date = t('schedule.errPickDate');
    setErrors(next);
    setProblem('');
    if (Object.keys(next).length) return;

    setSaving(true);
    const result = await addTransaction({
      type,
      product: category || label,
      quantity: type === 'sale' ? qty : 1,
      amount: value,
      date,
      title: label,
      note: note.trim(),
    });
    setSaving(false);
    if (!result?.ok) return setProblem(result?.error || t('sync.couldnTRecordTheTransaction'));
    navigation.goBack();
  };

  const categoryOptions = type === 'sale' ? items.map((i) => i.name) : EXPENSE_CATEGORIES;
  const overselling = selected?.kind === 'product' && qty !== null && qty > selected.stock;

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('recordTransaction')}</Text>
        <Text style={styles.subtitle}>{t('recordTransaction.addANewIncomeOr')}</Text>
      </View>

      <SegmentedControl
        options={[
          { value: 'sale', label: t('common.income') },
          { value: 'expense', label: t('common.expense') },
        ]}
        value={type}
        onChange={changeType}
      />

      <Banner type="error" text={problem} onClose={() => setProblem('')} />

      {type === 'sale' && !categoryOptions.length ? (
        <Text style={styles.hint}>{isServiceBusiness ? t('recordTransaction.noServicesHint') : t('recordTransaction.noItemsHint')}</Text>
      ) : (
        <Select
          label={type === 'sale' ? t('recordTransaction.whatSold') : t('common.category')}
          placeholder={type === 'sale' ? t('recordTransaction.pickItem') : t('recordTransaction.selectCategory')}
          options={categoryOptions}
          renderOption={
            type === 'sale'
              ? (name) => {
                  const it = findItem(name);
                  return it?.price > 0 ? `${name} · ${formatMoney(it.price)}` : name;
                }
              : (c) => tv('expenseCategory', c)
          }
          value={category}
          onChange={pickCategory}
        />
      )}

      <Input
        label={t('recordTransaction.title')}
        placeholder={type === 'sale' ? t('recordTransaction.saleTitlePlaceholder') : t('recordTransaction.expenseTitlePlaceholder')}
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
        }}
        error={errors.title}
      />

      <View style={styles.row}>
        {type === 'sale' ? (
          <Input
            style={styles.qty}
            label={t('common.quantity')}
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={(v) => {
              setQuantity(v);
              if (errors.quantity) setErrors((e) => ({ ...e, quantity: undefined }));
            }}
            error={errors.quantity}
          />
        ) : null}
        <Input
          style={styles.amount}
          label={t('recordTransaction.amount')}
          placeholder={`${currencySymbol} 0.00`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(v) => {
            amountTouched.current = true;
            setAmount(v);
            if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
          }}
          error={errors.amount}
          hint={type === 'sale' && selected?.price > 0 ? t('recordTransaction.totalHint') : undefined}
        />
      </View>

      {selected?.kind === 'product' ? (
        <View style={[styles.stockNote, overselling && styles.stockNoteWarn]}>
          <Text style={[styles.stockNoteText, overselling && { color: colors.warning }]}>
            {overselling
              ? t('recordTransaction.moreThanStock', { stock: formatNumber(selected.stock), name: selected.name })
              : t('recordTransaction.stockAfter', { name: selected.name, stock: formatNumber(Math.max(0, selected.stock - (qty || 0))) })}
          </Text>
        </View>
      ) : null}

      <DateField label={t('common.date')} value={date} onChange={setDate} maxDate={todayISO()} error={errors.date} />
      <Input label={t('recordTransaction.notesOptional')} placeholder={t('recordTransaction.addANote')} value={note} onChangeText={setNote} />

      <View style={{ height: 8 }} />
      <Button onPress={handleSave} loading={saving} disabled={saving}>{t('saveTransaction')}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  row: { flexDirection: 'row', gap: 10 },
  qty: { flex: 1 },
  amount: { flex: 2 },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 19 },
  stockNote: { backgroundColor: colors.inputBg, borderRadius: radius.md, padding: 10, marginTop: -6, marginBottom: 16 },
  stockNoteWarn: { backgroundColor: colors.warningBg },
  stockNoteText: { fontSize: 12.5, color: colors.textSoft, fontWeight: '600' },
});
