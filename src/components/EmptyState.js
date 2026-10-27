import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import Button from './Button';
import { colors, radius } from '../theme';

// What a list shows when it has nothing in it: an icon, one line saying so, an optional hint and an
// optional button for the obvious next step ("Add a customer"). `compact` is for small inline lists.
export default function EmptyState({ icon = 'albums-outline', title, body, actionLabel, onAction, compact = false, style }) {
  if (compact) {
    return (
      <View style={[styles.compact, style]} accessibilityRole="text">
        <Icon name={icon} size={16} color={colors.textMuted} />
        <Text style={styles.compactText}>{title}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, style]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button size="sm" variant="outline-accent" fullWidth={false} onPress={onAction} style={styles.action}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: 20, paddingHorizontal: 16, gap: 6, marginVertical: 6 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  action: { marginTop: 8, paddingHorizontal: 18 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  compactText: { flex: 1, fontSize: 13, color: colors.textMuted },
});
