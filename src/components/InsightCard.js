import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';

export default function InsightCard({ icon = 'bulb-outline', title, children, action }) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text style={styles.title}>
          <Icon name={icon} size={15} color={colors.white} style={styles.iconText} />
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
  iconText: { marginRight: 6 },
  body: { color: '#D9D5E4', fontSize: 13.5, lineHeight: 20 },
  bodyView: {},
  action: { marginTop: 12 },
});
