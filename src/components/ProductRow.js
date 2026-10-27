import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { stockStatus } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

const ICONS = { Beverages: 'wine-outline', Bakery: 'restaurant-outline', Snacks: 'fast-food-outline', Dairy: 'nutrition-outline' };
export const STOCK_BADGE = {
  GOOD: { bg: colors.successBg, text: colors.success, labelKey: 'stock.statusGood' },
  LOW: { bg: colors.warningBg, text: colors.warning, labelKey: 'stock.statusLow' },
  OUT: { bg: colors.dangerBg, text: colors.danger, labelKey: 'stock.statusOut' },
};

// One product in a stock list: name, category, price, how many are left and a Good / Low / Out badge.
// Tapping it opens the product's details.
export default function ProductRow({ product, onPress }) {
  const { t, formatMoney, formatNumber } = useTranslation();
  const badge = STOCK_BADGE[stockStatus(product)];
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('stock.openProduct', { name: product.name })}
    >
      <View style={styles.icon}>
        <Icon name={ICONS[product.category] || 'cube-outline'} size={17} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[product.category, t('stock.priceEach', { price: formatMoney(product.price) })].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.count}>{t('stock.inStockCount', { count: formatNumber(product.stock) })}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{t(badge.labelKey)}</Text>
        </View>
      </View>
      <Icon name="chevron-forward-outline" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: 14, color: colors.text, fontWeight: '700' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  count: { fontSize: 12.5, color: colors.text, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
});
