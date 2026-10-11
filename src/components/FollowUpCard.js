import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import FollowUpSheet from './FollowUpSheet';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { useContactLog } from '../hooks/useContactLog';
import { colors, radius } from '../theme';
import { followUpList, followUpMessage } from '../lib/schedule';

// "Customers to follow up": people with no booking and no recent visit, each
// with a one-tap WhatsApp / SMS message. Hidden when there is nobody to chase.
export default function FollowUpCard({ navigation, limit = 3 }) {
  const { state } = useApp();
  const { customers, upcomingWork, business } = state;
  const { contacted, markContacted } = useContactLog(navigation);
  const [active, setActive] = useState(null);

  const list = useMemo(() => followUpList(customers, upcomingWork, { contacted }), [customers, upcomingWork, contacted]);
  if (!list.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Customers to follow up</Text>
      {list.slice(0, limit).map((item) => (
        <View key={item.customer.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.customer.name}
            </Text>
            <Text style={styles.meta}>{item.reason}</Text>
          </View>
          <Pressable style={styles.btn} onPress={() => setActive(item)} accessibilityRole="button" accessibilityLabel={`Follow up with ${item.customer.name}`}>
            <Icon name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
            <Text style={styles.btnText}>Message</Text>
          </Pressable>
        </View>
      ))}
      {list.length > limit ? (
        <Pressable onPress={() => navigation.navigate('Operations', { view: 'customers' })} style={styles.more}>
          <Text style={styles.link}>+ {list.length - limit} more</Text>
        </Pressable>
      ) : null}

      <FollowUpSheet
        visible={Boolean(active)}
        customer={active?.customer}
        message={
          active
            ? followUpMessage({ kind: 'followup', customerName: active.customer.name, businessName: business?.name, service: active.lastService })
            : ''
        }
        onClose={() => setActive(null)}
        onSent={(customer) => markContacted(customer.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  btnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  more: { paddingVertical: 10, alignItems: 'center' },
  link: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
});
