import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

export default function TrendChart({ points, formatValue = (v) => `R${v}` }) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - 72, 340);
  const height = 120;
  const padding = 18;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const stepX = (width - padding * 2) / (points.length - 1 || 1);

  const coords = points.map((p, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((p.value - min) / range) * (height - padding * 2);
    return { x, y, ...p };
  });

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padding} L ${coords[0].x.toFixed(1)} ${height - padding} Z`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.max}>{formatValue(max)}</Text>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaD} fill="url(#trendFill)" stroke="none" />
        <Path d={pathD} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={2.5} fill={colors.primary} />
        ))}
      </Svg>
      <View style={styles.labels}>
        {points.map((p) => (
          <Text key={p.label} style={styles.labelText}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  max: { fontSize: 11, color: colors.textMuted, marginBottom: 4, fontWeight: '600' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  labelText: { fontSize: 10.5, color: colors.textMuted },
});
