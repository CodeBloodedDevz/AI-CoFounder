import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, gradient } from '../theme';

export default function GradientHeroCard({ label, value, delta }) {
  return (
    <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />
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
    overflow: 'hidden',
    shadowColor: '#8234C6',
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 5,
  },
  glow: { position: 'absolute', right: -30, top: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.14)' },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginBottom: 10 },
  value: { color: colors.white, fontSize: 30, fontWeight: '800', marginBottom: 10, letterSpacing: -0.8 },
  delta: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '600' },
});
