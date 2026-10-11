import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import SegmentedControl from '../components/SegmentedControl';
import Icon from '../components/Icon';
import { useApp } from '../context/AppContext';
import { colors, radius, gradient, shadow } from '../theme';

function dayLabel(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TransactionsScreen({ navigation }) {
  const { state } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const grouped = useMemo(() => {
    const filtered = state.transactions
      .filter((t) => (filter === 'all' ? true : filter === 'income' ? t.type === 'sale' : t.type === 'expense'))
      .filter((t) => {
        const label = t.title || t.product || '';
        return label.toLowerCase().includes(query.toLowerCase());
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const groups = {};
    filtered.forEach((t) => {
      const key = dayLabel(t.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [state.transactions, query, filter]);

  const groupKeys = Object.keys(grouped);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.title}>Transactions</Text>
          <Text style={styles.subtitle}>View and manage all transactions</Text>
        </View>

        <View style={styles.searchWrap}>
          <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search transactions"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expenses' },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {groupKeys.length ? (
          groupKeys.map((key) => (
            <View key={key} style={{ marginBottom: 8 }}>
              <Text style={styles.groupTitle}>{key}</Text>
              {grouped[key].map((t) => (
                <View style={styles.row} key={t.id}>
                  <View>
                    <Text style={styles.rowTitle}>{t.title || t.product}</Text>
                    <Text style={styles.rowMeta}>{t.time || dayLabel(t.date)}</Text>
                  </View>
                  <Text style={[styles.amount, { color: t.type === 'sale' ? colors.success : colors.danger }]}>
                    {t.type === 'sale' ? '' : '- '}R{Number(t.amount).toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No transactions match your search.</Text>
        )}
      </Screen>

      <Pressable style={styles.fabWrap} onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>
        <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.fab}>
          <Icon name="add" size={26} color={colors.white} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: colors.text },
  groupTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 6, marginTop: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 14.5, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 20 },
  fabWrap: { position: 'absolute', right: 20, bottom: 24 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
