import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, gradient } from '../theme';


export default function SegmentedControl({ options, value, onChange, style }) {
  return (
    <View style={[styles.row, style]}>
      {options.map((opt) => {
        const optValue = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = optValue === value;
        return (
          <Pressable key={optValue} style={styles.segmentWrap} onPress={() => onChange(optValue)}>
            {active ? (
              <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.segment}>
                <Text style={styles.labelActive} numberOfLines={1}>
                  {label}
                </Text>
              </LinearGradient>
            ) : (
              <View style={[styles.segment, styles.segmentInactive]}>
                <Text style={styles.label} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  segmentWrap: { flex: 1 },
  segment: {
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentInactive: {
    backgroundColor: colors.inputBg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  labelActive: { fontSize: 13, fontWeight: '700', color: colors.white },
});
