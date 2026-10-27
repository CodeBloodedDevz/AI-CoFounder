import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import WorkRow, { BookingBadge } from './WorkRow';
import { useApp } from '../context/AppContext';
import { colors, radius, type } from '../theme';
import { todayISO } from '../lib/schedule';
import { splitBookings } from '../lib/bookings';
import { useTranslation } from '../i18n/I18nContext';
import EmptyState from './EmptyState';
import Icon from './Icon';

// "Upcoming work" for the home screens: a short preview of the next appointments. "See more" opens the
// Upcoming Work page with the complete list; tapping a booking opens it there.
export default function UpcomingWorkSection({ navigation, limit = 3 }) {
  const { t } = useTranslation();
  const { state } = useApp();
  const { upcomingWork, customers, services } = state;
  const { upcoming, needsOutcome } = useMemo(() => splitBookings(upcomingWork, new Date(), services), [upcomingWork, services]);
  const today = todayISO();
  const todayCount = upcoming.filter((w) => w.date === today).length;
  const scheduleWork = () => navigation.navigate('Operations', { view: 'work' });
  const openList = () => navigation.navigate('UpcomingWork');
  const openBooking = (work) => navigation.navigate('UpcomingWork', { bookingId: work.id, openedAt: Date.now() });
  const outcomeNote = needsOutcome.length ? (
    <Pressable onPress={openList} style={styles.alert} accessibilityRole="button">
      <Text style={styles.alertText}>{t('booking.needsOutcomeCount', { count: needsOutcome.length })}</Text>
      <Text style={styles.link}>{t('booking.update')}</Text>
    </Pressable>
  ) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionTitle}>{t('upcomingWorkSection.upcomingWork')}</Text>
          {upcoming.length ? (
            <Text style={styles.sub}>
              {t('upcomingWorkSection.comingUp', { count: upcoming.length })}
              {todayCount ? ` · ${t('upcomingWorkSection.today', { count: todayCount })}` : ''}
            </Text>
          ) : null}
        </View>
        {/* With bookings, "See more" under the preview is the way to the full list. */}
        {upcoming.length ? null : (
          <Pressable onPress={scheduleWork} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>{t('upcomingWorkSection.schedule')}</Text>
          </Pressable>
        )}
      </View>

      {outcomeNote}
      {upcoming.length ? (
        <>
          {upcoming.slice(0, limit).map((work) => (
            <Pressable key={work.id} onPress={() => openBooking(work)} accessibilityRole="button">
              <WorkRow
                work={work}
                customerName={customers.find((c) => c.id === work.customerId)?.name}
                right={<BookingBadge work={work} services={services} />}
              />
            </Pressable>
          ))}
          {/* Always shown with bookings, so the full page (reminders, grouping) is reachable even with 1-3. */}
          <Pressable
            onPress={openList}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('upcomingWork.seeMoreLabel', { count: upcoming.length })}
          >
            <Text style={styles.link}>
              {upcoming.length > limit ? t('upcomingWork.seeMore', { count: upcoming.length - limit }) : t('common.seeMore')}
            </Text>
            <Icon name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        </>
      ) : (
        <>
          <EmptyState compact title={t('upcomingWorkSection.nothingScheduledYetBookYour')} />
          <Button variant="outline-accent" size="sm" onPress={scheduleWork}>{t('upcomingWorkSection.scheduleWork')}</Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  sectionTitle: type.sectionTitle,
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  status: { fontSize: 11.5, fontWeight: '700' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, marginTop: 4, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  alert: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, backgroundColor: colors.warningBg, borderRadius: 14, padding: 12, marginTop: 8, marginBottom: 4 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginVertical: 8 },
});
