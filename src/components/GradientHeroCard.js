import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, gradient } from '../theme';

export default function GradientHeroCard({ label, value, delta }) {
  return (
    <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {delta ? <Text style={styles.delta}>{delta}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginBottom: 10 },
  value: { color: colors.white, fontSize: 28, fontWeight: '800', marginBottom: 10 },
  delta: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '600' },
});
