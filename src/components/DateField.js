import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import PickerField from './PickerField';
import Icon from './Icon';
import { colors, radius } from '../theme';
import { MONTH_LONG, addDays, dayLabel, longDate, monthGrid, parseISO, todayISO } from '../lib/schedule';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// Tap the box, pick a day on a calendar. Stores "YYYY-MM-DD", so the server
// always receives a valid date (no more typing it by hand).
export default function DateField({ label = 'Date', value, onChange, placeholder = 'Select a date', error }) {
  const [open, setOpen] = useState(false);
  const start = parseISO(value) || new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });

  useEffect(() => {
    if (open) {
      const d = parseISO(value) || new Date();
      setCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const today = todayISO();

  const step = (delta) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const pick = (iso) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <>
      <PickerField
        label={label}
        icon="calendar-outline"
        value={value ? longDate(value) : ''}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        error={error}
      />
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={styles.quick}>
          {[['Today', today], ['Tomorrow', addDays(today, 1)]].map(([text, iso]) => (
            <Pressable key={text} style={[styles.chip, value === iso && styles.chipActive]} onPress={() => pick(iso)}>
              <Text style={[styles.chipText, value === iso && styles.chipTextActive]}>{text}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
            <Icon name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.monthText}>
            {MONTH_LONG[cursor.month]} {cursor.year}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {WEEKDAYS.map((d) => (
            <Text key={d} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((iso, j) => {
              if (!iso) return <View key={j} style={styles.cell} />;
              const selected = iso === value;
              return (
                <Pressable
                  key={j}
                  style={styles.cell}
                  onPress={() => pick(iso)}
                  accessibilityRole="button"
                  accessibilityLabel={dayLabel(iso)}
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.day, iso === today && styles.dayToday, selected && styles.daySelected]}>
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{Number(iso.slice(8))}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.white },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  monthText: { fontSize: 15, fontWeight: '700', color: colors.text },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: '700', color: colors.textMuted, paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: '84%', height: '84%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: 13.5, color: colors.text },
  dayTextSelected: { color: colors.white, fontWeight: '700' },
});
