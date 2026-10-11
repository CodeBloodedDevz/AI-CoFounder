import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { MONTH_NAMES, dayLabel, parseISO } from '../lib/schedule';

export const STATUS_COLORS = {
  Pending: colors.warning,
  Confirmed: colors.primary,
  Completed: colors.success,
  Cancelled: colors.textMuted,
  'No-show': colors.danger,
};

// One appointment: a small date block on the left, details in the middle.
// `right` is whatever the screen wants on the far side (status, buttons...).
export default function WorkRow({ work, customerName, right, below }) {
  const d = parseISO(work.date);
  return (
    <View style={styles.row}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{d ? d.getDate() : '–'}</Text>
        <Text style={styles.dateMonth}>{d ? MONTH_NAMES[d.getMonth()].toUpperCase() : ''}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {work.title || work.service || 'Appointment'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {dayLabel(work.date)}
          {work.time ? ` at ${work.time}` : ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[customerName || 'No customer assigned', work.service && work.service !== work.title ? work.service : null].filter(Boolean).join(' · ')}
        </Text>
        {below}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  dateBlock: { width: 46, height: 50, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 17, fontWeight: '800', color: colors.primaryDark, lineHeight: 20 },
  dateMonth: { fontSize: 9.5, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
