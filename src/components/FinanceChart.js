import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Line, Path, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { colors, radius } from '../theme';

// Business Analytics graph: income and expenses as side-by-side bars for every day / week / month of
// the period, profit (income - expenses) as a line across them. Profit can drop below zero, so the
// scale always includes 0 and the zero line is drawn stronger. Tap a period to see its exact figures
// (the latest period is shown to start with).
//
//   points       [{ label, from, to, income, expenses, profit }]   (lib/analytics.js -> trend)
//   labels       { income, expenses, profit }                       legend / detail words
//   formatValue  full amount, e.g. "R1 250"
//   formatAxis   short amount for the scale, e.g. "R1.3k"
//   formatPeriod (point) -> the period's dates, e.g. "Mon 12 Oct" or "1 – 7 Oct 2026"

export const SERIES_COLORS = { income: colors.primary, expenses: colors.danger, profit: colors.success };

const HEIGHT = 190; // drawing area, x labels included
const TOP = 10;
const X_LABELS = 22; // room under the bars for the period labels
const GUTTER = 46; // room on the left for the scale

/** Round numbers for the scale: 0 and 3-4 steps of 1, 2, 2.5 or 5 x 10^n that cover min..max. */
export function niceScale(min, max, steps = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return { min: 0, max: 1, ticks: [0, 1] };
  const raw = (hi - lo) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { min: start, max: end, ticks };
}

export default function FinanceChart({ points, labels, formatValue, formatAxis, formatPeriod }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(points.length - 1);
  // A new period (week / month / year) starts on its latest point again.
  const signature = points.map((p) => p.from).join('|');
  useEffect(() => setSelected(points.length - 1), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = Math.min(Math.max(selected, 0), points.length - 1);

  const geo = useMemo(() => {
    if (!width || !points.length) return null;
    const values = points.flatMap((p) => [p.income, p.expenses, p.profit]);
    const scale = niceScale(Math.min(...values), Math.max(...values));
    const plotW = Math.max(40, width - GUTTER);
    const plotH = HEIGHT - TOP - X_LABELS;
    const y = (v) => TOP + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
    const group = plotW / points.length;
    const bar = Math.max(3, Math.min(14, group * 0.28));
    const cx = (i) => GUTTER + group * i + group / 2;
    return { scale, plotW, plotH, y, group, bar, cx };
  }, [width, points]);

  const p = points[index];

  return (
    <View style={styles.wrap}>
      <View style={styles.legend}>
        <LegendItem color={SERIES_COLORS.income} label={labels.income} />
        <LegendItem color={SERIES_COLORS.expenses} label={labels.expenses} />
        <LegendItem color={SERIES_COLORS.profit} label={labels.profit} line />
      </View>

      <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ height: HEIGHT }}>
        {geo ? (
          <>
            <Svg width={width} height={HEIGHT}>
              {/* Scale */}
              {geo.scale.ticks.map((v) => (
                <Line key={`g${v}`} x1={GUTTER} x2={width} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? colors.textMuted : colors.border} strokeWidth={v === 0 ? 1.2 : 1} strokeDasharray={v === 0 ? undefined : '3 4'} />
              ))}
              {geo.scale.ticks.map((v) => (
                <SvgText key={`t${v}`} x={GUTTER - 6} y={geo.y(v) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end">
                  {formatAxis(v)}
                </SvgText>
              ))}

              {/* The chosen period */}
              <Rect x={GUTTER + geo.group * index + 2} y={TOP - 4} width={Math.max(0, geo.group - 4)} height={geo.plotH + 8} rx={8} fill={colors.primaryLight} opacity={0.55} />

              {/* Income and expense bars (from the zero line up) */}
              {points.map((pt, i) => {
                const zero = geo.y(0);
                const inc = zero - geo.y(Math.max(0, pt.income));
                const exp = zero - geo.y(Math.max(0, pt.expenses));
                return [
                  inc > 0 ? <Rect key={`i${i}`} x={geo.cx(i) - geo.bar - 1} y={zero - inc} width={geo.bar} height={inc} rx={Math.min(3, geo.bar / 2)} fill={SERIES_COLORS.income} /> : null,
                  exp > 0 ? <Rect key={`e${i}`} x={geo.cx(i) + 1} y={zero - exp} width={geo.bar} height={exp} rx={Math.min(3, geo.bar / 2)} fill={SERIES_COLORS.expenses} opacity={0.85} /> : null,
                ];
              })}

              {/* Profit line */}
              {points.length > 1 ? (
                <Path
                  d={points.map((pt, i) => `${i ? 'L' : 'M'} ${geo.cx(i).toFixed(1)} ${geo.y(pt.profit).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={SERIES_COLORS.profit}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {points.map((pt, i) => (
                <Circle key={`p${i}`} cx={geo.cx(i)} cy={geo.y(pt.profit)} r={i === index ? 4.5 : 3} fill={i === index ? colors.white : SERIES_COLORS.profit} stroke={SERIES_COLORS.profit} strokeWidth={i === index ? 2.5 : 0} />
              ))}

              {/* Period labels */}
              {points.map((pt, i) => (
                <SvgText
                  key={`x${i}`}
                  x={geo.cx(i)}
                  y={HEIGHT - 6}
                  fontSize={points.length > 8 ? 9 : 10.5}
                  fontWeight={i === index ? '700' : '400'}
                  fill={i === index ? colors.primaryDark : colors.textMuted}
                  textAnchor="middle"
                >
                  {pt.label}
                </SvgText>
              ))}
            </Svg>

            {/* One tap target per period (over the whole column, labels included). */}
            <View style={[StyleSheet.absoluteFill, styles.hitRow, { left: GUTTER }]}>
              {points.map((pt, i) => (
                <Pressable
                  key={`h${i}`}
                  style={styles.hit}
                  onPress={() => setSelected(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === index }}
                  accessibilityLabel={`${formatPeriod(pt)}: ${labels.income} ${formatValue(pt.income)}, ${labels.expenses} ${formatValue(pt.expenses)}, ${labels.profit} ${formatValue(pt.profit)}`}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {p ? (
        <View style={styles.detail}>
          <Text style={styles.detailDate}>{formatPeriod(p)}</Text>
          <View style={styles.detailRow}>
            <Figure color={SERIES_COLORS.income} label={labels.income} value={formatValue(p.income)} />
            <Figure color={SERIES_COLORS.expenses} label={labels.expenses} value={formatValue(p.expenses)} />
            <Figure color={SERIES_COLORS.profit} label={labels.profit} value={formatValue(p.profit)} valueColor={p.profit < 0 ? colors.danger : colors.success} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function LegendItem({ color, label, line }) {
  return (
    <View style={styles.legendItem}>
      {line ? (
        <View style={styles.legendLine}>
          <View style={[styles.legendLineBar, { backgroundColor: color }]} />
          <View style={[styles.legendLineDot, { backgroundColor: color }]} />
        </View>
      ) : (
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Figure({ color, label, value, valueColor }) {
  return (
    <View style={styles.figure}>
      <View style={styles.figureHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.figureLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.figureValue, valueColor && { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 20 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendLine: { width: 18, height: 10, alignItems: 'center', justifyContent: 'center' },
  legendLineBar: { position: 'absolute', left: 0, right: 0, height: 2.5, borderRadius: 2 },
  legendLineDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600', color: colors.textSoft },
  hitRow: { flexDirection: 'row' },
  hit: { flex: 1 },
  detail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  detailDate: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginBottom: 8 },
  detailRow: { flexDirection: 'row', gap: 8 },
  figure: { flex: 1, minWidth: 0 },
  figureHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  figureLabel: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600', flexShrink: 1 },
  figureValue: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
});
