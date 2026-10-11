import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import WorkRow, { STATUS_COLORS } from './WorkRow';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';
import { splitWork, todayISO } from '../lib/schedule';

// "Upcoming work" for the home screens: the next few appointments, so the
// owner sees them without opening More > Customers & work.
export default function UpcomingWorkSection({ navigation, limit = 4 }) {
  const { state } = useApp();
  const { upcomingWork, customers } = state;
  const { upcoming } = useMemo(() => splitWork(upcomingWork), [upcomingWork]);
  const today = todayISO();
  const todayCount = upcoming.filter((w) => w.date === today).length;
  const openWork = () => navigation.navigate('Operations', { view: 'work' });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionTitle}>Upcoming work</Text>
          {upcoming.length ? (
            <Text style={styles.sub}>
              {upcoming.length} coming up{todayCount ? ` · ${todayCount} today` : ''}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={openWork} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>{upcoming.length ? 'See all' : 'Schedule'}</Text>
        </Pressable>
      </View>

      {upcoming.length ? (
        <>
          {upcoming.slice(0, limit).map((work) => (
            <Pressable key={work.id} onPress={openWork} accessibilityRole="button">
              <WorkRow
                work={work}
                customerName={customers.find((c) => c.id === work.customerId)?.name}
                right={<Text style={[styles.status, { color: STATUS_COLORS[work.status] || colors.primary }]}>{work.status}</Text>}
              />
            </Pressable>
          ))}
          {upcoming.length > limit ? (
            <Pressable onPress={openWork} style={styles.more}>
              <Text style={styles.link}>+ {upcoming.length - limit} more</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.empty}>Nothing scheduled yet. Book your next appointment so it shows up here.</Text>
          <Button variant="outline-accent" size="sm" onPress={openWork}>
            Schedule work
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  status: { fontSize: 11.5, fontWeight: '700' },
  more: { paddingVertical: 10, alignItems: 'center' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginVertical: 8 },
});
