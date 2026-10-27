import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAssistant } from '../context/AssistantContext';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import BottomSheet from '../components/BottomSheet';
import ConfirmDialog from '../components/ConfirmDialog';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import TransactionEditForm from '../components/TransactionEditForm';
import { useBanner } from '../components/useBanner';
import { useApp } from '../context/AppContext';
import { dayLabel, parseISO } from '../lib/schedule';
import { colors, radius, gradient, shadow, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// The Add record button is 56 tall and sits 24 from the bottom; the AI button goes just above it.
const ADD_BUTTON_CLEARANCE = 56 + 24 - 16 + 12;
// Long histories are shown a page at a time so the list stays quick on older phones.
const PAGE = 60;

const dayKey = (tx) => (parseISO(String(tx.date || '').slice(0, 10)) ? String(tx.date).slice(0, 10) : '');
// Newest day first; inside a day, the most recently recorded first.
const newestFirst = (a, b) => dayKey(b).localeCompare(dayKey(a)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export default function TransactionsScreen({ navigation }) {
  const { t, formatMoney, formatNumber, formatDate } = useTranslation();
  const { setFabClearance } = useAssistant();
  useFocusEffect(
    useCallback(() => {
      setFabClearance(ADD_BUTTON_CLEARANCE);
      return () => setFabClearance(0);
    }, [setFabClearance])
  );
  const { state, deleteTransaction , reloadData } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { banner, show, clear } = useBanner(5000);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.transactions
      .filter((tx) => (filter === 'all' ? true : filter === 'income' ? tx.type === 'sale' : tx.type === 'expense'))
      .filter((tx) => {
        if (!q) return true;
        return [tx.title, tx.product, tx.note].some((v) => String(v || '').toLowerCase().includes(q));
      })
      .sort(newestFirst);
  }, [state.transactions, query, filter]);

  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [query, filter]);

  const groups = useMemo(() => {
    const out = [];
    filtered.slice(0, visible).forEach((tx) => {
      const key = dayKey(tx);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(tx);
      else out.push({ key, label: key ? dayLabel(key) : t('schedule.noDate'), items: [tx] });
    });
    return out;
  }, [filtered, visible, t]);

  const totals = useMemo(() => {
    let income = 0;
    let spent = 0;
    filtered.forEach((tx) => {
      if (tx.type === 'sale') income += Number(tx.amount || 0);
      else spent += Number(tx.amount || 0);
    });
    return { income, spent, net: income - spent };
  }, [filtered]);

  const open = state.transactions.find((tx) => tx.id === openId) || null;

  const remove = async () => {
    const target = open;
    setDeleting(true);
    const result = await deleteTransaction(target.id);
    setDeleting(false);
    setConfirm(false);
    if (!result?.ok) {
      setOpenId(null);
      return show('error', result?.error || t('sync.couldntDeleteTransaction'));
    }
    setOpenId(null);
    show(
      'success',
      result.stock?.product
        ? t('transactions.deletedRestored', { qty: formatNumber(target.quantity), name: result.stock.product })
        : t('transactions.deleted')
    );
  };

  const nothingYet = state.transactions.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen onRefresh={reloadData}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('navTransactions')}</Text>
          <Text style={styles.subtitle}>{t('transactions.viewAndManageAllTransactions')}</Text>
        </View>

        <Banner type={banner?.type} text={banner?.text} onClose={clear} />

        {nothingYet ? (
          <View style={styles.emptyBox}>
            <Icon name="receipt-outline" size={34} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('transactions.noneYet')}</Text>
            <Text style={styles.emptyBody}>{t('transactions.noneYetBody')}</Text>
            <Button icon="add" onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>{t('recordTransaction')}</Button>
          </View>
        ) : (
          <>
            <View style={styles.searchWrap}>
              <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('transactions.searchTransactions')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('transactions.searchTransactions')}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.clearSearch')}>
                  <Icon name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <SegmentedControl
              options={[
                { value: 'all', label: t('all') },
                { value: 'income', label: t('common.income') },
                { value: 'expense', label: t('expenses') },
              ]}
              value={filter}
              onChange={setFilter}
            />

            {filtered.length ? (
              <View style={styles.totals}>
                {filter !== 'expense' ? (
                  <View style={styles.totalCell}>
                    <Text style={styles.totalLabel}>{t('common.income')}</Text>
                    <Text style={[styles.totalValue, { color: colors.success }]}>{formatMoney(totals.income, { decimals: 0 })}</Text>
                  </View>
                ) : null}
                {filter !== 'income' ? (
                  <View style={styles.totalCell}>
                    <Text style={styles.totalLabel}>{t('expenses')}</Text>
                    <Text style={[styles.totalValue, { color: colors.danger }]}>{formatMoney(totals.spent, { decimals: 0 })}</Text>
                  </View>
                ) : null}
                {filter === 'all' ? (
                  <View style={styles.totalCell}>
                    <Text style={styles.totalLabel}>{t('transactions.net')}</Text>
                    <Text style={styles.totalValue}>{formatMoney(totals.net, { decimals: 0 })}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {groups.length ? (
              groups.map((group) => (
                <View key={group.key || 'none'} style={{ marginBottom: 8 }}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  {group.items.map((tx) => {
                    const isSale = tx.type === 'sale';
                    const qty = Number(tx.quantity) || 0;
                    const customer = tx.customerId ? state.customers.find((c) => c.id === tx.customerId) : null;
                    const meta = [
                      isSale ? (tx.source === 'booking' ? t('transactions.fromBooking') : t('common.income')) : t('common.expense'),
                      tx.source === 'booking' && customer && !(tx.title || '').includes(customer.name) ? customer.name : null,
                      tx.title && tx.product && tx.title !== tx.product ? tx.product : null,
                      qty > 1 ? t('transactions.qty', { qty: formatNumber(qty) }) : null,
                      tx.note || null,
                    ].filter(Boolean);
                    return (
                      <Pressable
                        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                        key={tx.id}
                        onPress={() => {
                          setEditing(false);
                          setOpenId(tx.id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${tx.title || tx.product}, ${formatMoney(Number(tx.amount))}`}
                      >
                        <View style={[styles.dot, { backgroundColor: isSale ? colors.successBg : colors.dangerBg }]}>
                          <Icon name={isSale ? 'arrow-down' : 'arrow-up'} size={14} color={isSale ? colors.success : colors.danger} />
                        </View>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{tx.title || tx.product}</Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>{meta.join(' · ')}</Text>
                        </View>
                        <Text style={[styles.amount, { color: isSale ? colors.success : colors.danger }]}>
                          {isSale ? '' : '- '}{formatMoney(Number(tx.amount), { decimals: 0 })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            ) : (
              <EmptyState compact icon="search-outline" title={t('transactions.noTransactionsMatchYourSearch')} style={{ marginTop: 12 }} />
            )}
            {filtered.length > visible ? (
              <Button variant="outline-accent" size="sm" onPress={() => setVisible((v) => v + PAGE)} style={{ marginTop: 12 }}>
                {t('common.showMore', { count: filtered.length - visible })}
              </Button>
            ) : null}
          </>
        )}
      </Screen>

      <Pressable
        style={styles.fabWrap}
        onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}
        accessibilityRole="button"
        accessibilityLabel={t('recordTransaction')}
      >
        <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.fab}>
          <Icon name="add" size={26} color={colors.white} />
        </LinearGradient>
      </Pressable>

      <BottomSheet
        visible={Boolean(open)}
        title={open ? (editing ? t('transactions.editTitle') : open.title || open.product) : ''}
        onClose={() => {
          setOpenId(null);
          setEditing(false);
        }}
      >
        {open && editing ? (
          <TransactionEditForm
            transaction={open}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              show('success', t('transactions.saved'));
            }}
          />
        ) : open ? (
          <View>
            <Text style={[styles.sheetAmount, { color: open.type === 'sale' ? colors.success : colors.danger }]}>
              {open.type === 'sale' ? '' : '- '}{formatMoney(Number(open.amount))}
            </Text>
            {[
              [t('transactions.type'), open.type === 'sale' ? (open.source === 'booking' ? t('transactions.fromBooking') : t('common.income')) : t('common.expense')],
              [t('operations.customer'), open.customerId ? state.customers.find((c) => c.id === open.customerId)?.name : null],
              [t('transactions.bookingPriceLabel'), open.source === 'booking' && open.bookingPrice > 0 ? formatMoney(open.bookingPrice) : null],
              [
                t('transactions.extraLabel'),
                open.source === 'booking' && open.bookingPrice > 0 && Number(open.amount) !== open.bookingPrice
                  ? `${Number(open.amount) > open.bookingPrice ? '+' : '-'}${formatMoney(Math.abs(Number(open.amount) - open.bookingPrice))}`
                  : null,
              ],
              [t('common.date'), open.date ? formatDate(open.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
              [open.type === 'sale' ? t('transactions.item') : t('common.category'), open.product],
              [t('common.quantity'), formatNumber(Number(open.quantity) || 1)],
              [t('transactions.note'), open.note],
              [t('transactions.edited'), open.editHistory?.length ? t('transactions.editedTimes', { count: open.editHistory.length, date: formatDate(String(open.updatedAt || open.editHistory[open.editHistory.length - 1].at).slice(0, 10)) }) : null],
            ]
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            <View style={{ height: 16 }} />
            <Button icon="create-outline" onPress={() => setEditing(true)}>{t('transactions.edit')}</Button>
            <View style={{ height: 10 }} />
            <Button variant="outline-danger" icon="trash-outline" onPress={() => setConfirm(true)}>{t('transactions.delete')}</Button>
          </View>
        ) : null}
        <ConfirmDialog
          visible={confirm}
          title={t('transactions.deleteTitle')}
          message={
            open?.source === 'booking'
              ? t('transactions.deleteBookingBody')
              : open?.type === 'sale'
              ? t('transactions.deleteSaleBody')
              : t('transactions.deleteExpenseBody')
          }
          loading={deleting}
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: colors.text },
  totals: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  totalCell: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  totalLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted, marginBottom: 3 },
  totalValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  groupTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 6, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 14.5, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 20 },
  emptyBox: { alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: 22, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyBody: { fontSize: 13.5, color: colors.textSoft, textAlign: 'center', lineHeight: 19, marginBottom: 10 },
  fabWrap: { position: 'absolute', right: 20, bottom: 24 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadow.raised },
  sheetAmount: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.textMuted },
  detailValue: { fontSize: 13.5, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
