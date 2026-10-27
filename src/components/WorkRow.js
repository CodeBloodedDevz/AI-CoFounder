import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { monthShort, dayLabel, parseISO } from '../lib/schedule';
import { bookingState } from '../lib/bookings';
import { useTranslation } from '../i18n/I18nContext';

// Colours for each booking state (same palette as the rest of the app).
export const STATE_STYLE = {
  scheduled: { bg: colors.primaryLight, text: colors.primaryDark },
  confirmed: { bg: colors.primaryLight, text: colors.primaryDark },
  awaiting: { bg: colors.warningBg, text: colors.warning },
  completed: { bg: colors.successBg, text: colors.success },
  missed: { bg: colors.dangerBg, text: colors.danger },
  cancelled: { bg: colors.inputBg, text: colors.textMuted },
};
// Kept for older imports: colour per stored status.
export const STATUS_COLORS = {
  Pending: colors.primary,
  Confirmed: colors.primary,
  Completed: colors.success,
  Cancelled: colors.textMuted,
  'No-show': colors.danger,
};

/** The booking's state as a small coloured label: Scheduled, Confirmed, Needs an outcome, Completed, Missed, Cancelled. */
export function BookingBadge({ work, services, now }) {
  const { t } = useTranslation();
  const state = bookingState(work, now || new Date(), services || []);
  const st = STATE_STYLE[state];
  return (
    <View style={[styles.badge, { backgroundColor: st.bg }]} accessibilityLabel={t(`booking.state.${state}`)}>
      <Text style={[styles.badgeText, { color: st.text }]}>{t(`booking.state.${state}`)}</Text>
    </View>
  );
}

// One appointment: a small date block on the left, details in the middle.
// `right` is whatever the screen wants on the far side (status, buttons...); `below` goes under the details.
export default function WorkRow({ work, customerName, right, below, showCustomer = true }) {
  const { t, formatMoney } = useTranslation();
  const d = parseISO(work.date);
  const muted = work.status === 'Cancelled';
  return (
    <View style={styles.row}>
      <View style={[styles.dateBlock, muted && styles.dateBlockMuted]}>
        <Text style={[styles.dateDay, muted && styles.mutedText]}>{d ? d.getDate() : '–'}</Text>
        <Text style={[styles.dateMonth, muted && styles.mutedText]}>{d ? monthShort(d.getMonth()).toUpperCase() : ''}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, muted && styles.struck]} numberOfLines={1}>
            {work.title || work.service || t('workRow.appointment')}
          </Text>
          {right}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {dayLabel(work.date)}
          {work.time ? ` ${t('schedule.atTime', { time: work.time })}` : ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            showCustomer ? customerName || t('workRow.noCustomer') : null,
            work.service && work.service !== work.title ? work.service : null,
            work.price > 0 ? formatMoney(Number(work.price), { decimals: 0 }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {work.rescheduledFrom ? (
          <Text style={styles.note} numberOfLines={1}>
            {t('booking.rescheduledFrom', { from: work.rescheduledFrom })}
          </Text>
        ) : null}
        {work.notes ? (
          <Text style={styles.meta} numberOfLines={2}>
            {work.notes}
          </Text>
        ) : null}
        {below}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  dateBlock: { width: 46, height: 50, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dateBlockMuted: { backgroundColor: colors.inputBg },
  dateDay: { fontSize: 17, fontWeight: '800', color: colors.primaryDark, lineHeight: 20 },
  dateMonth: { fontSize: 9.5, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 },
  mutedText: { color: colors.textMuted },
  info: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  note: { fontSize: 11.5, color: colors.primaryDark, marginTop: 3, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
});
