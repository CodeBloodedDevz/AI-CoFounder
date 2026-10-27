import { View, Text, Switch, Pressable, StyleSheet } from 'react-native';
import { colors, radius, shadow } from '../theme';
import Icon from './Icon';

// Small building blocks that repeat across the designer's screens.

/** White rounded card with the soft border and shadow used throughout the designs. */
export function Card({ children, style, tone }) {
  return <View style={[styles.card, tone === 'low' && styles.cardLow, tone === 'danger' && styles.cardDanger, style]}>{children}</View>;
}

/** Upper-case section caption above a group ("BUSINESS SETUP"). */
export function SectionLabel({ children, style }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

const PILL_TONES = {
  neutral: { bg: colors.surfaceMid, fg: colors.textSoft },
  accent: { bg: colors.primaryLight, fg: colors.primaryDark },
  success: { bg: '#6FFBBE', fg: '#005236' },
  danger: { bg: colors.dangerBg, fg: '#93000A' },
  crimson: { bg: colors.crimsonLight, fg: '#91002D' },
};

/** Small rounded status / plan badge. */
export function Pill({ label, tone = 'neutral', style, textStyle }) {
  const t = PILL_TONES[tone] || PILL_TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.pillText, { color: t.fg }, textStyle]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** The designer's switch: violet when on. */
export function Toggle({ value, onValueChange, label, trackOn = colors.primary, disabled }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: '#D3DAEF', true: trackOn }}
      thumbColor="#FFFFFF"
      activeThumbColor="#FFFFFF"
    />
  );
}

/** A card holding several SettingsRow items separated by hairlines. */
export function SettingsGroup({ children, style }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <View style={[styles.group, style]}>
      {rows.map((child, i) => (
        <View key={i} style={i > 0 ? styles.groupDivider : null}>{child}</View>
      ))}
    </View>
  );
}

/** One tappable row of a SettingsGroup: tinted icon tile, title + description, optional badge and chevron. */
export function SettingsRow({ icon, iconColor = colors.primary, iconBg = colors.surfaceLow, title, description, badge, badgeTone = 'neutral', trailing, onPress, muted, chevron = true }) {
  const body = (
    <View style={styles.row}>
      <View style={[styles.iconTile, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={20} color={muted ? colors.textMuted : iconColor} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, muted && { color: colors.textMuted }]} numberOfLines={1}>{title}</Text>
          {badge ? <Pill label={badge} tone={badgeTone} /> : null}
        </View>
        {description ? <Text style={styles.rowDesc} numberOfLines={1}>{description}</Text> : null}
      </View>
      {trailing}
      {chevron && onPress ? <Icon name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => pressed && { backgroundColor: colors.surfaceLow }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, ...shadow.card },
  cardLow: { backgroundColor: colors.surfaceLow, shadowOpacity: 0, elevation: 0 },
  cardDanger: { borderColor: 'rgba(186,26,26,0.35)' },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textSoft, marginBottom: 8, marginLeft: 4 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg + 4, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  groupDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceLow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  iconTile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  rowDesc: { fontSize: 13, color: colors.textSoft, marginTop: 1 },
});
