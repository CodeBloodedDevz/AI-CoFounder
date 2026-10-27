import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { Pill } from './ui';
import { colors, radius, gradient, shadow } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { initialsOf } from '../lib/sponsoredRules';

// One advert on the Sponsored page.
//   variant="list"     full-width card in the main list (standard adverts)
//   variant="featured" narrower card in the featured strip; priority adverts get the brand gradient ring
// The whole card and the "Learn More" button both open the business page.
export default function SponsoredAdCard({ ad, variant = 'list', onLearnMore, preview = false, style }) {
  const { t } = useTranslation();
  const featured = variant === 'featured';
  const priority = ad.placement === 'priority';
  const name = ad.business?.name || '';
  const logo = ad.business?.logoUrl;

  const media = ad.imageUrl ? (
    <Image source={{ uri: ad.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
  ) : logo ? (
    <View style={[styles.image, styles.logoStage]}>
      <Image source={{ uri: logo }} style={styles.stageLogo} resizeMode="contain" />
    </View>
  ) : (
    <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={[styles.image, styles.initialsStage]}>
      <Text style={styles.stageInitials}>{initialsOf(name)}</Text>
    </LinearGradient>
  );

  const body = (
    <Pressable
      onPress={onLearnMore}
      disabled={!onLearnMore}
      accessibilityRole="button"
      accessibilityLabel={t('sponsored.card.a11y', { title: ad.title, business: name })}
      style={({ pressed }) => [styles.card, featured && styles.cardFeatured, ad.placement === 'featured' && featured && styles.cardFeaturedRing, pressed && { opacity: 0.92 }]}
    >
      {media}
      <View style={styles.body}>
        <View style={styles.bizRow}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} /> : (
            <View style={[styles.logo, styles.logoInitials]}><Text style={styles.logoInitialsText}>{initialsOf(name)}</Text></View>
          )}
          <Text style={styles.bizName} numberOfLines={1}>{name}</Text>
          <Text style={styles.sponsored}>{t('sponsored.card.sponsored')}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{ad.title}</Text>
        <Text style={styles.desc} numberOfLines={featured ? 2 : 3}>{ad.description}</Text>
        <View style={styles.footer}>
          <Pill label={t(`sponsored.category.${ad.category}`)} tone={priority ? 'crimson' : ad.placement === 'featured' ? 'accent' : 'neutral'} style={styles.catPill} />
          <View style={styles.cta} pointerEvents="none">
            <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.ctaInner}>
              <Text style={styles.ctaText}>{t('sponsored.card.learnMore')}</Text>
              <Icon name="arrow-forward" size={14} color={colors.white} />
            </LinearGradient>
          </View>
        </View>
        {preview ? <Text style={styles.previewNote}>{t('sponsored.card.previewNote')}</Text> : null}
      </View>
    </Pressable>
  );

  // Priority adverts: the brand gradient as a 2px ring, the one bold element on the page.
  if (priority && featured) {
    return (
      <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={[styles.ring, style]}>
        {body}
      </LinearGradient>
    );
  }
  return <View style={style}>{body}</View>;
}

const styles = StyleSheet.create({
  ring: { borderRadius: radius.xl, padding: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl - 2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  cardFeatured: { borderWidth: 0 },
  cardFeaturedRing: { borderWidth: 2, borderColor: colors.primary },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surfaceLow },
  logoStage: { alignItems: 'center', justifyContent: 'center' },
  stageLogo: { width: '40%', height: '70%' },
  initialsStage: { alignItems: 'center', justifyContent: 'center' },
  stageInitials: { color: colors.white, fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  body: { padding: 14 },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  logo: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.surfaceLow },
  logoInitials: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoInitialsText: { fontSize: 10, fontWeight: '800', color: colors.primaryDark },
  bizName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  sponsored: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.2, lineHeight: 21 },
  desc: { fontSize: 13, color: colors.textSoft, lineHeight: 19, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  catPill: { flexShrink: 1 },
  cta: { borderRadius: radius.pill, overflow: 'hidden' },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  previewNote: { marginTop: 10, fontSize: 11.5, color: colors.textMuted },
});
