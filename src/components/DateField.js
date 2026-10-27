import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import PickerField from './PickerField';
import Icon from './Icon';
import { colors, radius } from '../theme';
import { monthLong, dayShort, addDays, dayLabel, longDate, monthGrid, parseISO, todayISO } from '../lib/schedule';
import { useTranslation } from '../i18n/I18nContext';

const weekdays = () => [1, 2, 3, 4, 5, 6, 0].map((i) => Array.from(dayShort(i)).slice(0, 2).join(''));

// Tap the box, pick a day on a calendar. Stores "YYYY-MM-DD", so the server
// always receives a valid date (no more typing it by hand).
// maxDate ("YYYY-MM-DD", optional): later days can't be picked (e.g. no sales dated in the future).
export default function DateField({ label, value, onChange, placeholder, error, maxDate }) {
  const { t } = useTranslation();
  label = label ?? t('common.date');
  placeholder = placeholder ?? t('dateField.selectDate');
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
          {[[t('schedule.today'), today], maxDate ? [t('schedule.yesterday'), addDays(today, -1)] : [t('schedule.tomorrow'), addDays(today, 1)]]
            .filter(([, iso]) => !maxDate || iso <= maxDate)
            .map(([text, iso]) => (
            <Pressable key={text} style={[styles.chip, value === iso && styles.chipActive]} onPress={() => pick(iso)}>
              <Text style={[styles.chipText, value === iso && styles.chipTextActive]}>{text}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.monthRow}>
          <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('dateField.previousMonth')}>
            <Icon name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.monthText}>
            {monthLong(cursor.month)} {cursor.year}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('dateField.nextMonth')}>
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.week}>
          {weekdays().map((d) => (
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
              const blocked = Boolean(maxDate) && iso > maxDate;
              return (
                <Pressable
                  key={j}
                  style={styles.cell}
                  onPress={blocked ? undefined : () => pick(iso)}
                  disabled={blocked}
                  accessibilityRole="button"
                  accessibilityLabel={dayLabel(iso)}
                  accessibilityState={{ selected, disabled: blocked }}
                >
                  <View style={[styles.day, iso === today && styles.dayToday, selected && styles.daySelected, blocked && { opacity: 0.3 }]}>
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
