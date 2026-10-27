import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Select from '../components/Select';
import ConfirmDialog from '../components/ConfirmDialog';
import { useBanner } from '../components/useBanner';
import { useApp } from '../context/AppContext';
import { useAssistant } from '../context/AssistantContext';
import { recommendPrice, recommendServicePrice } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';
import Icon from '../components/Icon';
import BackButton from '../components/BackButton';
import PlanGate from '../components/PlanGate';

const ICONS = { Beverages: 'wine-outline', Bakery: 'restaurant-outline', Snacks: 'fast-food-outline', Dairy: 'nutrition-outline' };

export default function PricingAssistantScreen(props) {
  const { t } = useTranslation();
  return (
    <PlanGate feature="pricingAssistant" planName="Pro" title={t('pricingAssistant.aiPricingAssistantIsA')} navigation={props.navigation}>
      <PricingAssistant {...props} />
    </PlanGate>
  );
}

function PricingAssistant({ route, navigation }) {
  const { state, updateProductPrice, updateService } = useApp();
  const assistant = useAssistant();
  const { t, formatMoney } = useTranslation();
  const { products, services, transactions, upcomingWork, business } = state;

  const model = business?.businessModel || 'Product-based';
  const hasProducts = model !== 'Service-based' && products.length > 0;
  const hasServices = model !== 'Product-based' && services.length > 0;

  const initialTab = route.params?.serviceId ? 'service' : route.params?.productId || !hasServices ? 'product' : 'service';
  const [tab, setTab] = useState(hasProducts && hasServices ? initialTab : hasServices ? 'service' : 'product');
  const [selectedProductId, setSelectedProductId] = useState(route.params?.productId || products[0]?.id);
  const [selectedServiceId, setSelectedServiceId] = useState(route.params?.serviceId || services[0]?.id);
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const { banner, show, clear } = useBanner(5000);

  const product = tab === 'product' ? products.find((p) => p.id === selectedProductId) || products[0] : null;
  const service = tab === 'service' ? services.find((s) => s.id === selectedServiceId) || services[0] : null;

  const productRec = useMemo(() => (product ? recommendPrice(product, transactions, business) : null), [product, transactions, business]);
  const serviceRec = useMemo(() => (service ? recommendServicePrice(service, upcomingWork, business) : null), [service, upcomingWork, business]);

  const rec = tab === 'product' ? productRec : serviceRec;
  const item = tab === 'product' ? product : service;

  if (!hasProducts && !hasServices) {
    return (
      <Screen>
        <BackButton navigation={navigation} />
        <Text style={styles.title}>{t('aiPricingAssistant')}</Text>
        <View style={styles.emptyBox}>
          <Icon name="pricetags-outline" size={30} color={colors.primary} />
          <Text style={styles.emptyText}>{model === 'Service-based' ? t('pricing.addServiceFirst') : t('pricing.addProductFirst')}</Text>
          <Button variant="outline-accent" onPress={() => navigation.navigate('Main', { screen: 'StockTab' })}>
            {model === 'Service-based' ? t('serviceDashboard.manageServices') : t('pricing.goToStock')}
          </Button>
        </View>
      </Screen>
    );
  }

  const same = rec && Math.abs(Number(rec.recommendedPrice) - Number(rec.currentPrice)) < 0.005;
  const diff = rec ? Number(rec.recommendedPrice) - Number(rec.currentPrice) : 0;

  const apply = async () => {
    setConfirm(false);
    setApplying(true);
    const result =
      tab === 'product'
        ? await updateProductPrice(product.id, rec.recommendedPrice)
        : await updateService(service.id, { price: rec.recommendedPrice });
    setApplying(false);
    if (!result?.ok) return show('error', result?.error || t('sync.couldnTUpdateThePrice'));
    show('success', t('pricing.applied', { name: item.name, price: formatMoney(rec.recommendedPrice) }));
  };

  // Hands the question to the real AI Co-Founder chat, with the numbers it needs.
  const askAi = () => {
    assistant.ask(
      t('pricing.askQuestion', {
        name: item.name,
        current: formatMoney(rec.currentPrice),
        suggested: formatMoney(rec.recommendedPrice),
      })
    );
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('aiPricingAssistant')}</Text>
        <Text style={styles.subtitle}>{t('pricing.subtitle')}</Text>
      </View>

      {hasProducts && hasServices && (
        <View style={styles.tabs}>
          {[
            ['product', t('common.products')],
            ['service', t('navServices')],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => {
                setTab(key);
                clear();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {tab === 'product' ? (
        <Select
          label={t('common.product')}
          options={products.map((p) => p.id)}
          renderOption={(id) => products.find((p) => p.id === id)?.name || ''}
          value={product?.id}
          onChange={(id) => {
            setSelectedProductId(id);
            clear();
          }}
        />
      ) : (
        <Select
          label={t('common.service')}
          options={services.map((s) => s.id)}
          renderOption={(id) => services.find((s) => s.id === id)?.name || ''}
          value={service?.id}
          onChange={(id) => {
            setSelectedServiceId(id);
            clear();
          }}
        />
      )}

      <Banner type={banner?.type} text={banner?.text} onClose={clear} />

      {item && rec ? (
        <>
          <View style={styles.productCard}>
            <Icon name={tab === 'product' ? ICONS[product.category] || 'cube-outline' : 'construct-outline'} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productMeta}>
                {tab === 'product'
                  ? [t('pricing.category', { name: product.category }), product.cost > 0 ? t('pricing.costIs', { cost: formatMoney(product.cost) }) : null].filter(Boolean).join(' · ')
                  : [service.category, service.duration].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>{t('currentPrice')}</Text>
              <Text style={styles.priceValue}>{formatMoney(Number(rec.currentPrice), { decimals: 2 })}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>{tab === 'product' ? t('currentMargin') : t('pricing.estMargin')}</Text>
              <Text style={[styles.priceValue, rec.currentMarginPct < 0 && { color: colors.danger }]}>{rec.currentMarginPct}%</Text>
            </View>
          </View>

          {tab === 'product' && !(product.cost > 0) ? <Text style={styles.note}>{t('pricing.noCostNote')}</Text> : null}
          {tab === 'service' && (
            <Text style={styles.note}>{t('pricing.operatingCost', { cost: formatMoney(rec.estimatedOperatingCost, { decimals: 0 }), count: rec.bookingsCount })}</Text>
          )}

          <InsightCard icon="cash-outline" title={t('aiRecommendedPrice')}>
            <Text style={styles.recommendedPrice}>{formatMoney(Number(rec.recommendedPrice), { decimals: 2 })}</Text>
            <Text style={styles.recommendedDiff}>
              {same ? t('pricing.alreadyRight') : t(diff > 0 ? 'pricing.raiseBy' : 'pricing.lowerBy', { amount: formatMoney(Math.abs(diff)) })}
            </Text>
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
          <Text style={styles.reason}>{rec.reason}</Text>
          <Text style={styles.disclaimer}>{t('pricing.disclaimer')}</Text>

          <View style={{ height: 8 }} />
          <Button onPress={() => setConfirm(true)} loading={applying} disabled={applying || same}>
            {same ? t('pricing.nothingToApply') : t('pricing.applyAmount', { price: formatMoney(rec.recommendedPrice) })}
          </Button>
          <View style={{ height: 12 }} />
          <Button variant="outline-accent" icon="sparkles-outline" onPress={askAi}>
            {t('askAIWhy')}
          </Button>

          <ConfirmDialog
            visible={confirm}
            tone="primary"
            title={t('pricing.confirmTitle')}
            message={t('pricing.confirmBody', { name: item.name, from: formatMoney(rec.currentPrice), to: formatMoney(rec.recommendedPrice) })}
            confirmLabel={t('applyPrice')}
            onConfirm={apply}
            onCancel={() => setConfirm(false)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 12.5 },
  tabTextActive: { color: colors.white },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 18 },
  productName: { fontWeight: '700', fontSize: 14.5, color: colors.text },
  productMeta: { fontSize: 12, color: colors.textMuted },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  priceLabel: { fontSize: 12, fontWeight: '700', color: colors.warning },
  priceValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: 16, lineHeight: 17 },
  recommendedPrice: { fontSize: 24, fontWeight: '800', color: colors.white },
  recommendedDiff: { fontSize: 12.5, color: '#D9D5E4', marginTop: 4 },
  locationNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -8, marginBottom: 16 },
  locationNoteText: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  sectionTitle: type.sectionTitle,
  reason: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20, marginBottom: 6 },
  disclaimer: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, marginBottom: 8 },
  emptyBox: { alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: 22, marginTop: 16 },
  emptyText: { fontSize: 13.5, color: colors.textSoft, textAlign: 'center', lineHeight: 19 },
});
