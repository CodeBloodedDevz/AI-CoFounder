import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

const TONES = {
  sales: { bg: colors.primaryLight, text: colors.primaryDark },
  expenses: { bg: colors.dangerBg, text: colors.danger },
  profit: { bg: colors.successBg, text: colors.success },
  primary: { bg: colors.inputBg, text: colors.text },
};

export default function StatCard({ label, value, tone = 'primary' }) {
  const palette = TONES[tone] || TONES.primary;
  return (
    <View style={[styles.card, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.value, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  value: { fontSize: 18, fontWeight: '800' },
});
