import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, ScrollView, Pressable, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../components/Input';
import Icon from '../components/Icon';
import Banner from '../components/Banner';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import SponsoredAdCard from '../components/SponsoredAdCard';
import { HeaderIconButton } from '../components/ScreenHeader';
import { useApp } from '../context/AppContext';
import { useAssistant } from '../context/AssistantContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type, layout } from '../theme';
import { useSponsoredApi, createEventQueue, dailySeed, getTrackedAdPayment } from '../lib/sponsored';

// The Sponsored page: adverts from businesses on AI Co-Founder. Open to every plan.
//   featured strip  - Priority (gradient ring) and Growth (violet ring) adverts, rotated fairly per person per day
//   category chips  - only categories that have adverts right now
//   list            - standard adverts, 20 at a time
// Views are reported when at least half a card has been on screen for a moment; "Learn More" taps too.
const VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 800 };
const STALE_MS = 60_000;

export default function SponsoredScreen({ navigation }) {
  const { t } = useTranslation();
  const { state } = useApp();
  const { buttonShown } = useAssistant();
  const api = useSponsoredApi();
  const seed = useMemo(() => dailySeed(state.user?.id), [state.user?.id]);

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(null);
  const [data, setData] = useState(null); // { featured, ads, page, totalPages, total, categories }
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const loadedAt = useRef(0);
  const request = useRef(0);

  // One queue per visit to the page; whatever is left is sent when the page closes.
  const queue = useMemo(() => createEventQueue({ send: (events) => api.events(events) }), [api]);
  useEffect(() => () => queue.flush(), [queue]);

  // Search waits until the person stops typing.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async ({ page = 1, mode = 'initial' } = {}) => {
    const id = ++request.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'more') setLoadingMore(true);
    const r = await api.browse({ category, q: search, seed, page });
    if (id !== request.current) return; // a newer search started meanwhile
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
    if (!r.ok) return setError(r.error);
    setError('');
    loadedAt.current = Date.now();
    setData((prev) => (mode === 'more' && prev ? { ...r.data, featured: prev.featured, ads: [...prev.ads, ...r.data.ads] } : r.data));
  }, [api, category, search, seed]);

  useEffect(() => { load(); }, [load]);

  // Coming back to the tab after a while shows fresh adverts (campaigns start and end through the day).
  useEffect(() => navigation.addListener('focus', () => {
    getTrackedAdPayment().then((p) => setPaymentInProgress(Boolean(p)));
    if (Date.now() - loadedAt.current > STALE_MS) load({ mode: 'silent' });
  }), [navigation, load]);

  const learnMore = (ad) => {
    queue.add(ad.id, 'click');
    queue.flush();
    navigation.navigate('SponsoredBusiness', { adId: ad.id });
  };

  // FlatList needs the same callback for its whole life, so it reads the current queue through a ref.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const onViewable = useRef(({ viewableItems }) => {
    viewableItems.forEach((v) => v.isViewable && v.item?.id && queueRef.current?.add(v.item.id, 'impression'));
  }).current;

  const chips = data?.categories || [];
  const filtering = Boolean(category || search);

  const header = (
    <View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.pageTitle} accessibilityRole="header">{t('sponsored.title')}</Text>
          <Text style={type.pageSubtitle}>{t('sponsored.subtitle')}</Text>
        </View>
        <HeaderIconButton icon="megaphone-outline" color={colors.primary} label={t('sponsored.myAds.title')} onPress={() => navigation.navigate('MyAds')} />
      </View>

      {paymentInProgress ? (
        <Pressable style={styles.notice} onPress={() => navigation.navigate('MyAds')} accessibilityRole="button">
          <Icon name="time-outline" size={16} color={colors.primary} />
          <Text style={styles.noticeText}>{t('sponsored.paymentInProgress')}</Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}

      <Input
        icon="search-outline"
        value={query}
        onChangeText={setQuery}
        placeholder={t('sponsored.searchPlaceholder')}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.search}
        accessibilityLabel={t('sponsored.searchPlaceholder')}
      />

      {chips.length > 1 || category ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
          <Chip label={t('sponsored.allCategories')} active={!category} onPress={() => setCategory(null)} />
          {chips.map((c) => (
            <Chip key={c.id} label={t(`sponsored.category.${c.id}`)} count={c.count} active={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
          ))}
        </ScrollView>
      ) : null}

      {error ? <Banner type="error" text={error} onClose={() => setError('')} /> : null}

      {data?.featured?.length ? (
        <View style={styles.featuredBlock}>
          <Text style={type.sectionTitle}>{t('sponsored.featured')}</Text>
          <FlatList
            horizontal
            data={data.featured}
            keyExtractor={(a) => a.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredList}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={VIEWABILITY}
            renderItem={({ item }) => <SponsoredAdCard ad={item} variant="featured" onLearnMore={() => learnMore(item)} style={styles.featuredCard} />}
          />
        </View>
      ) : null}

      {data?.ads?.length ? <Text style={type.sectionTitle}>{filtering ? t('sponsored.results', { count: data.total }) : t('sponsored.allBusinesses')}</Text> : null}
    </View>
  );

  const empty = loading ? (
    <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
  ) : !data?.featured?.length && !error ? (
    filtering ? (
      <EmptyState icon="search-outline" title={t('sponsored.noMatches')} body={t('sponsored.noMatchesBody')} actionLabel={t('sponsored.clearFilters')} onAction={() => { setQuery(''); setSearch(''); setCategory(null); }} />
    ) : (
      <EmptyState icon="megaphone-outline" title={t('sponsored.emptyTitle')} body={t('sponsored.emptyBody')} actionLabel={t('sponsored.advertiseCta')} onAction={() => navigation.navigate('MyAds')} />
    )
  ) : null;

  const footer = (
    <View style={styles.footer}>
      {loadingMore ? <ActivityIndicator color={colors.primary} /> : data && data.page < data.totalPages ? (
        <Button variant="outline" onPress={() => load({ page: data.page + 1, mode: 'more' })}>{t('sponsored.loadMore')}</Button>
      ) : null}
      {data && (data.total > 0) ? (
        <Pressable style={styles.advertise} onPress={() => navigation.navigate('MyAds')} accessibilityRole="button">
          <View style={styles.advertiseIcon}><Icon name="megaphone" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.advertiseTitle}>{t('sponsored.advertiseTitle')}</Text>
            <Text style={styles.advertiseBody}>{t('sponsored.advertiseBody')}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={data?.ads || []}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <SponsoredAdCard ad={item} onLearnMore={() => learnMore(item)} style={styles.listCard} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, buttonShown && styles.roomForButton]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ mode: 'silent' }); }} tintColor={colors.primary} colors={[colors.primary]} />}
      />
    </SafeAreaView>
  );
}

function Chip({ label, count, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count ? <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  roomForButton: { paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primaryDark },
  search: { marginBottom: 10 },
  chipsWrap: { marginHorizontal: -20, marginBottom: 14 },
  chips: { paddingHorizontal: 20, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSoft },
  chipTextActive: { color: colors.white },
  chipCount: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  featuredBlock: { marginBottom: 18 },
  featuredList: { gap: 12, paddingRight: 20 },
  featuredCard: { width: 280 },
  listCard: { marginBottom: 14 },
  footer: { gap: 16, marginTop: 6 },
  advertise: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: 14 },
  advertiseIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  advertiseTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  advertiseBody: { fontSize: 12.5, color: colors.textSoft, marginTop: 2, lineHeight: 17 },
});
