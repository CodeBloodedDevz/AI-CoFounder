import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import Select from '../components/Select';
import { useApp } from '../context/AppContext';
import { recommendPrice } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';

const ICONS = { Beverages: 'wine-outline', Bakery: 'restaurant-outline', Snacks: 'fast-food-outline', Dairy: 'nutrition-outline' };

export default function PricingAssistantScreen({ route, navigation }) {
  const productId = route.params?.productId;
  const { state, updateProductPrice } = useApp();
  const { t } = useTranslation();
  const { products, transactions, business } = state;

  const [selectedId, setSelectedId] = useState(productId || products[0]?.id);
  const [showWhy, setShowWhy] = useState(true);

  const product = products.find((p) => p.id === selectedId) || products[0];
  const rec = useMemo(() => (product ? recommendPrice(product, transactions, business) : null), [product, transactions, business]);

  if (!product) {
    return (
      <Screen>
        <BackButton navigation={navigation} />
        <Text style={styles.empty}>Add a product first to get a pricing recommendation.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('aiPricingAssistant')}</Text>
      </View>

      <Select
        label="Product"
        options={products.map((p) => p.name)}
        value={product.name}
        onChange={(name) => {
          const p = products.find((pr) => pr.name === name);
          if (p) setSelectedId(p.id);
        }}
      />

      <View style={styles.productCard}>
        <Icon name={ICONS[product.category] || 'cube-outline'} size={22} color={colors.primary} />
        <View>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productMeta}>Category: {product.category}</Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <View>
          <Text style={styles.priceLabel}>{t('currentPrice')}</Text>
          <Text style={styles.priceValue}>R{rec.currentPrice.toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.priceLabel, { color: colors.textMuted }]}>{t('currentMargin')}</Text>
          <Text style={styles.priceValue}>{rec.currentMarginPct}%</Text>
        </View>
      </View>

      <InsightCard icon="cash-outline" title={t('aiRecommendedPrice')}>
        <Text style={styles.recommendedPrice}>R{rec.recommendedPrice.toFixed(2)}</Text>
      </InsightCard>

      {rec.locationArea ? <View style={styles.locationNote}><Icon name="location-outline" size={14} color={colors.textMuted} /><Text style={styles.locationNoteText}>{t('priceLocationNote')}: {rec.locationArea}</Text></View> : null}

      <Text style={styles.sectionTitle}>{t('whyThisPrice')}</Text>
      {showWhy && <Text style={styles.reason}>{rec.reason}</Text>}

      <View style={{ height: 8 }} />
      <Button
        onPress={() => {
          updateProductPrice(product.id, rec.recommendedPrice);
          navigation.navigate('Main', { screen: 'Dashboard' });
        }}
      >
        {t('applyPrice')}
      </Button>
      <View style={{ height: 12 }} />
      <Button variant="outline-accent" onPress={() => setShowWhy((s) => !s)}>
        {t('askAIWhy')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  productName: { fontWeight: '700', fontSize: 14.5, color: colors.text },
  productMeta: { fontSize: 12, color: colors.textMuted },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  priceLabel: { fontSize: 12, fontWeight: '700', color: colors.warning },
  priceValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  recommendedPrice: { fontSize: 24, fontWeight: '800', color: colors.white },
  locationNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -8, marginBottom: 16 },
  locationNoteText: { fontSize: 12, color: colors.textMuted },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 8 },
  reason: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20, marginBottom: 8 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', padding: 20 },
});
