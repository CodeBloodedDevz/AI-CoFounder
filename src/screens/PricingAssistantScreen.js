import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import Select from '../components/Select';
import { useApp } from '../context/AppContext';
import { recommendPrice, recommendServicePrice } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';

const ICONS = { Beverages: 'wine-outline', Bakery: 'restaurant-outline', Snacks: 'fast-food-outline', Dairy: 'nutrition-outline' };

export default function PricingAssistantScreen({ route, navigation }) {
  const { state, updateProductPrice, updateService } = useApp();
  const { t } = useTranslation();
  const { products, services, transactions, upcomingWork, business } = state;

  const model = business?.businessModel || 'Product-based';
  const hasProducts = model !== 'Service-based' && products.length > 0;
  const hasServices = model !== 'Product-based' && services.length > 0;

  const initialTab = route.params?.serviceId
    ? 'service'
    : route.params?.productId || !hasServices
    ? 'product'
    : 'service';
  const [tab, setTab] = useState(hasProducts && hasServices ? initialTab : hasServices ? 'service' : 'product');

  const [selectedProductId, setSelectedProductId] = useState(route.params?.productId || products[0]?.id);
  const [selectedServiceId, setSelectedServiceId] = useState(route.params?.serviceId || services[0]?.id);
  const [showWhy, setShowWhy] = useState(true);

  const product = tab === 'product' ? products.find((p) => p.id === selectedProductId) || products[0] : null;
  const service = tab === 'service' ? services.find((s) => s.id === selectedServiceId) || services[0] : null;

  const productRec = useMemo(
    () => (product ? recommendPrice(product, transactions, business) : null),
    [product, transactions, business]
  );
  const serviceRec = useMemo(
    () => (service ? recommendServicePrice(service, upcomingWork, business) : null),
    [service, upcomingWork, business]
  );

  const rec = tab === 'product' ? productRec : serviceRec;
  const item = tab === 'product' ? product : service;

  if (!hasProducts && !hasServices) {
    return (
      <Screen>
        <BackButton navigation={navigation} />
        <Text style={styles.empty}>
          Add a {model === 'Service-based' ? 'service' : 'product'} first to get a pricing recommendation.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('aiPricingAssistant')}</Text>
      </View>

      {hasProducts && hasServices && (
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, tab === 'product' && styles.tabActive]} onPress={() => setTab('product')}>
            <Text style={[styles.tabText, tab === 'product' && styles.tabTextActive]}>Products</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'service' && styles.tabActive]} onPress={() => setTab('service')}>
            <Text style={[styles.tabText, tab === 'service' && styles.tabTextActive]}>Services</Text>
          </Pressable>
        </View>
      )}

      {tab === 'product' ? (
        <Select
          label="Product"
          options={products.map((p) => p.name)}
          value={product?.name}
          onChange={(name) => {
            const p = products.find((pr) => pr.name === name);
            if (p) setSelectedProductId(p.id);
          }}
        />
      ) : (
        <Select
          label="Service"
          options={services.map((s) => s.name)}
          value={service?.name}
          onChange={(name) => {
            const s = services.find((sv) => sv.name === name);
            if (s) setSelectedServiceId(s.id);
          }}
        />
      )}

      {!item || !rec ? (
        <Text style={styles.empty}>
          Add a {tab === 'product' ? 'product' : 'service'} first to get a pricing recommendation.
        </Text>
      ) : (
        <>
          <View style={styles.productCard}>
            <Icon
              name={tab === 'product' ? ICONS[product.category] || 'cube-outline' : 'construct-outline'}
              size={22}
              color={colors.primary}
            />
            <View>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productMeta}>
                {tab === 'product' ? `Category: ${product.category}` : `${service.category} · ${service.duration}`}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>{t('currentPrice')}</Text>
              <Text style={styles.priceValue}>R{Number(rec.currentPrice).toFixed(2)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>
                {tab === 'product' ? t('currentMargin') : 'Est. margin'}
              </Text>
              <Text style={styles.priceValue}>{rec.currentMarginPct}%</Text>
            </View>
          </View>

          {tab === 'service' && (
            <Text style={styles.operatingCostNote}>
              Estimated operating cost: R{rec.estimatedOperatingCost} · {rec.bookingsCount} completed booking
              {rec.bookingsCount === 1 ? '' : 's'} so far
            </Text>
          )}

          <InsightCard icon="cash-outline" title={t('aiRecommendedPrice')}>
            <Text style={styles.recommendedPrice}>R{Number(rec.recommendedPrice).toFixed(2)}</Text>
          </InsightCard>

          {rec.locationArea ? (
            <View style={styles.locationNote}>
              <Icon name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.locationNoteText}>
                {t('priceLocationNote')}: {rec.locationArea}
              </Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>{t('whyThisPrice')}</Text>
          {showWhy && <Text style={styles.reason}>{rec.reason}</Text>}

          <View style={{ height: 8 }} />
          <Button
            onPress={() => {
              if (tab === 'product') {
                updateProductPrice(product.id, rec.recommendedPrice);
              } else {
                updateService(service.id, { price: rec.recommendedPrice });
              }
              navigation.navigate('Main', { screen: 'Dashboard' });
            }}
          >
            {t('applyPrice')}
          </Button>
          <View style={{ height: 12 }} />
          <Button variant="outline-accent" onPress={() => setShowWhy((s) => !s)}>
            {t('askAIWhy')}
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 12.5 },
  tabTextActive: { color: colors.white },
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
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  priceLabel: { fontSize: 12, fontWeight: '700', color: colors.warning },
  priceValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  operatingCostNote: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  recommendedPrice: { fontSize: 24, fontWeight: '800', color: colors.white },
  locationNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -8, marginBottom: 16 },
  locationNoteText: { fontSize: 12, color: colors.textMuted },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 8 },
  reason: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20, marginBottom: 8 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', padding: 20 },
});
