import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// The designer's top app bar: a round back button, then (optional small eyebrow,) title and subtitle,
// with optional action buttons on the right. Use it instead of BackButton + a hand-made title block.
//   navigation - when given (and it can go back) the round back button shows
//   right      - e.g. <HeaderIconButton icon="refresh-outline" ... />
export default function ScreenHeader({ navigation, title, subtitle, eyebrow, right, style }) {
  const { t } = useTranslation();
  const canGoBack = Boolean(navigation && navigation.canGoBack && navigation.canGoBack());
  return (
    <View style={[styles.row, style]}>
      {canGoBack ? (
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Icon name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.titles}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export function HeaderIconButton({ icon, onPress, label, color = colors.textSoft }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  back: { width: 40, height: 40, marginLeft: -8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.primary, marginBottom: 1 },
  title: { ...type.pageTitle, fontSize: 20, lineHeight: 26 },
  subtitle: { fontSize: 13, lineHeight: 18, color: colors.textSoft, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
