import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function InsightCard({ icon = '💡', title, children, action }) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text style={styles.title}>
          <Text style={styles.iconText}>{icon} </Text>
          {title}
        </Text>
      ) : null}
      {children ? (
        typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : <View style={styles.bodyView}>{children}</View>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.dark,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 20,
  },
  title: { color: colors.white, fontWeight: '700', fontSize: 13.5, marginBottom: 8 },
  iconText: { fontSize: 14 },
  body: { color: '#D9D5E4', fontSize: 13.5, lineHeight: 20 },
  bodyView: {},
  action: { marginTop: 12 },
});
