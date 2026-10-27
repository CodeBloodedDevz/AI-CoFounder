import { View, Text, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import Button from './Button';
import WorkRow, { BookingBadge } from './WorkRow';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { customerHistory } from '../lib/bookings';
import { dayLabel } from '../lib/schedule';
import { colors, radius } from '../theme';
import EmptyState from './EmptyState';

// A customer's appointment history: completed visits, upcoming, missed and cancelled bookings, last visit
// and next appointment, all worked out from the booking records (so they are right after any change).
export default function CustomerHistorySheet({ customer, visible, onClose, onBook }) {
  const { state } = useApp();
  const { t, formatMoney } = useTranslation();
  if (!customer) return null;
  const h = customerHistory(customer.id, state.upcomingWork, { services: state.services, transactions: state.transactions });
  const tiles = [
    [t('booking.summary.visits'), h.visits, colors.success],
    [t('booking.summary.upcoming'), h.upcoming, colors.primary],
    [t('booking.summary.missed'), h.missed, colors.danger],
    [t('booking.summary.cancelled'), h.cancelled, colors.textMuted],
  ];
  return (
    <BottomSheet visible={visible} title={customer.name} onClose={onClose}>
      <Text style={styles.contact}>{[customer.phone, customer.email].filter(Boolean).join(' · ') || t('operations.noContact')}</Text>
      <View style={styles.tiles}>
        {tiles.map(([label, value, color]) => (
          <View key={label} style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
            <Text style={[styles.tileValue, { color }]}>{value}</Text>
            <Text style={styles.tileLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.facts}>
        <Fact label={t('booking.summary.lastVisit')} value={h.lastVisit ? `${dayLabel(h.lastVisit.date)}${h.lastVisit.service ? ` · ${h.lastVisit.service}` : ''}` : t('booking.summary.none')} />
        <Fact label={t('booking.summary.next')} value={h.nextBooking ? `${dayLabel(h.nextBooking.date)}${h.nextBooking.time ? ` ${t('schedule.atTime', { time: h.nextBooking.time })}` : ''}` : t('booking.summary.none')} />
        <Fact label={t('booking.summary.spent')} value={formatMoney(h.spent, { decimals: 0 })} />
        {h.awaiting ? <Fact label={t('booking.summary.awaiting')} value={String(h.awaiting)} warn /> : null}
      </View>

      <Text style={styles.section}>{t('booking.history', { count: h.total })}</Text>
      {h.items.length ? (
        h.items.map((w) => <WorkRow key={w.id} work={w} showCustomer={false} right={<BookingBadge work={w} services={state.services} />} />)
      ) : (
        <EmptyState compact title={t('booking.noHistory')} />
      )}
      {onBook ? (
        <Button icon="calendar-outline" onPress={() => onBook(customer)} style={{ marginTop: 16 }}>
          {t('booking.bookFor', { name: customer.name })}
        </Button>
      ) : null}
    </BottomSheet>
  );
}

function Fact({ label, value, warn }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, warn && { color: colors.warning }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contact: { fontSize: 13, color: colors.textMuted, marginBottom: 14 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tile: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  tileValue: { fontSize: 20, fontWeight: '800' },
  tileLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  facts: { backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  factLabel: { fontSize: 12.5, color: colors.textMuted },
  factValue: { fontSize: 13, color: colors.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  section: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 4 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
