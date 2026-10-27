import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform, ActivityIndicator, AppState } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { colors, radius, shadow, gradient } from '../theme';
import { PLANS, getPlan, planPrice, planRank } from '../lib/payment';
import { useTranslation } from '../i18n/I18nContext';

// Plan names and amounts as shown to the person (the plan ids and prices themselves never change).
const usePlanText = () => {
  const { t, formatMoney, formatDate } = useTranslation();
  const planName = (id, fallback) => (t.has(`plans.${id}.name`) ? t(`plans.${id}.name`) : fallback);
  const formatRand = (amount) => formatMoney(amount, { symbol: 'R', decimals: Number.isInteger(Number(amount)) ? 0 : 2 });
  return { t, planName, formatRand, formatDate };
};

const POLL_MS = 4000;
const POLL_GIVE_UP_MS = 10 * 60_000;
const RENEW_WINDOW_DAYS = 7;

const daysUntil = (iso) => (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null);

// Sends the person to Paystack's secure checkout page.
async function openCheckout(url) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return true;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

export default function SubscriptionScreen({ navigation }) {
  const { t, planName, formatRand, formatDate } = usePlanText();
  const app = useApp();
  const { state, startCheckout, verifyPayment, cancelSubscription, resumeSubscription, refreshSubscription, paymentResult, clearPaymentResult, trackPayment, clearTrackedPayment, getTrackedPayment } = app;
  const subscription = state.subscription;
  const payments = state.payments || {};
  const isPaidActive = subscription.planId !== 'free';

  const [mode, setMode] = useState(isPaidActive ? 'manage' : 'plans'); // plans | manage | confirmDowngrade | checkout | awaiting | result
  const [billingCycle, setBillingCycle] = useState(subscription.billingCycle || 'monthly');
  const [selectedPlanId, setSelectedPlanId] = useState(subscription.planId === 'free' ? 'pro' : subscription.planId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [askCancel, setAskCancel] = useState(false); // the "Cancel subscription?" dialog (Alert does nothing on the web)
  const startedWaiting = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const selectedPlan = getPlan(selectedPlanId);
  const canPay = payments.enabled;

  // Fresh plan details when the screen opens, and pick up a payment that was left open (e.g. after the browser reloaded).
  useEffect(() => {
    refreshSubscription();
    (async () => {
      const tracked = await getTrackedPayment();
      if (tracked && mounted.current) {
        setReference(tracked);
        startedWaiting.current = Date.now();
        setMode('awaiting');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app already settled a payment in the background (see AppContext): show the outcome.
  useEffect(() => {
    if (paymentResult && mode !== 'awaiting') {
      setResult(paymentResult);
      setMode('result');
      clearPaymentResult();
    }
  }, [paymentResult, mode, clearPaymentResult]);

  const finish = useCallback(async (payment) => {
    await clearTrackedPayment();
    setResult(payment);
    setMode('result');
  }, [clearTrackedPayment]);

  // Ask the server (which asks Paystack) how the payment went.
  const check = useCallback(async ({ cancel = false } = {}) => {
    if (!reference) return null;
    const r = await verifyPayment(reference, { cancel });
    if (!mounted.current) return null;
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setError('');
    if (r.payment.status !== 'pending') await finish(r.payment);
    return r.payment;
  }, [reference, verifyPayment, finish]);

  // While waiting, check every few seconds. The server does the real verification.
  useEffect(() => {
    if (mode !== 'awaiting' || !reference || gaveUp) return undefined;
    const timer = setInterval(() => {
      if (Date.now() - startedWaiting.current > POLL_GIVE_UP_MS) {
        setGaveUp(true);
        return;
      }
      check();
    }, POLL_MS);
    check();
    return () => clearInterval(timer);
  }, [mode, reference, gaveUp, check]);

  // Coming back from Paystack's page (switching apps on a phone, or the tab regaining focus on the web):
  // ask straight away instead of waiting for the next tick, and the screen settles itself.
  useEffect(() => {
    if (mode !== 'awaiting' || !reference) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => sub?.remove?.();
  }, [mode, reference, check]);

  const choosePlan = (planId) => {
    setError('');
    setSelectedPlanId(planId);
    setMode(planId === 'free' ? 'confirmDowngrade' : 'checkout');
  };

  const handlePay = async () => {
    setError('');
    setSubmitting(true);
    const r = await startCheckout({ planId: selectedPlan.id, billingCycle });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await trackPayment(r.reference);
    setReference(r.reference);
    setCheckoutUrl(r.authorizationUrl);
    setGaveUp(false);
    startedWaiting.current = Date.now();
    setMode('awaiting');
    const opened = await openCheckout(r.authorizationUrl);
    if (!opened) setError(t('subscription.couldntOpen'));
  };

  const reopen = async () => {
    let url = checkoutUrl;
    if (!url) {
      const r = await startCheckout({ planId: selectedPlan.id, billingCycle }); // returns the same open checkout
      if (!r.ok) return setError(r.error);
      url = r.authorizationUrl;
      setCheckoutUrl(url);
    }
    await openCheckout(url);
  };

  const cancelAttempt = async () => {
    const payment = await check({ cancel: true });
    if (payment) return;
    await clearTrackedPayment();
    setMode('plans');
  };

  const handleDowngrade = async () => {
    setSubmitting(true);
    const r = await cancelSubscription();
    setSubmitting(false);
    setAskCancel(false);
    if (!r.ok) return setError(r.error);
    setMode(r.subscription.planId === 'free' ? 'plans' : 'manage');
  };

  const confirmCancel = () => {
    setError('');
    setAskCancel(true);
  };

  const renewDays = daysUntil(subscription.renewsOn);
  const canRenew = isPaidActive && renewDays !== null && renewDays <= RENEW_WINDOW_DAYS;

  return (
    <Screen>
      <ScreenHeader navigation={navigation} title={t('subscription.subscription')} subtitle={t('subscription.chooseThePlanThatFits')} />

      {payments.mode === 'test' && mode !== 'result' ? (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerTitle}>{t('subscription.testModeNoRealMoney')}</Text>
          <Text style={styles.testBannerText}>{t('subscription.onThePaystackPageUse')}</Text>
        </View>
      ) : null}
      {!canPay && mode !== 'result' ? (
        <View style={styles.notice}>
          <Icon name="information-circle-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noticeText}>{t('subscription.onlinePaymentsArenTSwitched')}</Text>
        </View>
      ) : null}
      {error && mode !== 'awaiting' ? <Text style={styles.errorBox}>{error}</Text> : null}

      {mode === 'manage' && (
        <ManageView
          subscription={subscription}
          history={state.paymentHistory || []}
          canRenew={canRenew && canPay}
          onRenew={() => choosePlan(subscription.planId)}
          onChangePlan={() => setMode('plans')}
          onCancel={confirmCancel}
          onResume={async () => { const r = await resumeSubscription(); if (!r.ok) setError(r.error); }}
        />
      )}

      {mode === 'plans' && (
        <PlansView
          subscription={subscription}
          billingCycle={billingCycle}
          setBillingCycle={setBillingCycle}
          onChoosePlan={choosePlan}
          canPay={canPay}
          history={isPaidActive ? [] : state.paymentHistory || []}
        />
      )}

      {mode === 'confirmDowngrade' && (
        <View>
          <View style={styles.card}>
            <Icon name="information-circle-outline" size={22} color={colors.textMuted} />
            <Text style={styles.downgradeText}>
              {isPaidActive
                ? t('subscription.downgradeInfo', { plan: planName(subscription.planId, subscription.plan), date: subscription.renewsOn ? formatDate(subscription.renewsOn) : t('subscription.endOfPeriod') })
                : t('subscription.alreadyFree')}
            </Text>
          </View>
          <Button variant="outline" onPress={() => setMode(isPaidActive ? 'manage' : 'plans')} style={{ marginBottom: 10 }}>{t('common.goBack')}</Button>
          {isPaidActive ? <Button variant="primary" loading={submitting} disabled={submitting} onPress={handleDowngrade}>{t('subscription.confirmSwitchToFreeWhen')}</Button> : null}
        </View>
      )}

      {mode === 'checkout' && (
        <View>
          <Pressable onPress={() => setMode('plans')} style={styles.changePlanLink}>
            <Icon name="chevron-back-outline" size={15} color={colors.primary} />
            <Text style={styles.changePlanLinkText}>{t('subscription.chooseADifferentPlan')}</Text>
          </Pressable>

          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryPlan}>{t('subscription.planName', { name: planName(selectedPlan.id, selectedPlan.name) })}</Text>
              <Text style={styles.summaryCycle}>{billingCycle === 'annual' ? t('subscription.billedAnnually') : t('subscription.billedMonthly')}</Text>
            </View>
            <Text style={styles.summaryPrice}>
              {formatRand(planPrice(selectedPlan, billingCycle))}
              <Text style={styles.summaryPer}>/{billingCycle === 'annual' ? t('subscription.perYear') : t('subscription.perMonth')}</Text>
            </Text>
          </View>

          <View style={styles.secureNote}>
            <Icon name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={styles.secureNoteText}>{t('subscription.youLlPayOnPaystack')}</Text>
          </View>

          <Button icon="card-outline" loading={submitting} disabled={submitting || !canPay} onPress={handlePay}>
            {t('subscription.payWithPaystack', { amount: formatRand(planPrice(selectedPlan, billingCycle)) })}
          </Button>
        </View>
      )}

      {mode === 'awaiting' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.bigText}>{gaveUp ? t('subscription.stillWaiting') : t('subscription.waiting')}</Text>
          <Text style={styles.bodyText}>
            {gaveUp
              ? t('subscription.gaveUpBody')
              : t('subscription.waitingBody')}
          </Text>
          {error ? <Text style={styles.errorBox}>{error}</Text> : null}
          <View style={{ width: '100%' }}>
            <Button icon="refresh" onPress={() => check()} style={{ marginBottom: 10 }}>{t('subscription.iVePaidCheckNow')}</Button>
            <Button variant="outline" icon="open-outline" onPress={reopen} style={{ marginBottom: 10 }}>{t('subscription.openPaymentPage')}</Button>
            <Button variant="outline-danger" onPress={cancelAttempt}>{t('subscription.cancelThisPayment')}</Button>
          </View>
          {reference ? <Text style={styles.refText}>{t('subscription.reference', { ref: reference })}</Text> : null}
        </View>
      )}

      <ConfirmDialog
        visible={askCancel}
        title={t('subscription.cancelQuestion')}
        message={
          subscription.renewsOn
            ? t('subscription.keepUntilDate', { plan: planName(subscription.planId, subscription.plan), date: formatDate(subscription.renewsOn) })
            : t('subscription.keepUntilEnd', { plan: planName(subscription.planId, subscription.plan) })
        }
        cancelLabel={t('subscription.keepPlan')}
        confirmLabel={t('subscription.cancelSubscription')}
        loading={submitting}
        onConfirm={handleDowngrade}
        onCancel={() => setAskCancel(false)}
      />

      {mode === 'result' && result && (
        <ResultView
          result={result}
          onDone={() => { setResult(null); setMode(subscription.planId !== 'free' ? 'manage' : 'plans'); refreshSubscription(); }}
          onRetry={() => { setSelectedPlanId(result.planId); setBillingCycle(result.billingCycle); setResult(null); setMode('checkout'); }}
          onPlans={() => { setResult(null); setMode('plans'); }}
        />
      )}
    </Screen>
  );
}

function StatusChip({ status }) {
  const { t } = usePlanText();
  const good = status === 'success';
  const bad = status === 'failed' || status === 'mismatch' || status === 'expired' || status === 'cancelled';
  return (
    <View style={[styles.chip, { backgroundColor: good ? colors.successBg : bad ? '#FDE7EA' : colors.inputBg }]}>
      <Text style={[styles.chipText, { color: good ? colors.success : bad ? colors.danger : colors.textMuted }]}>{t.has(`payment.status.${status}`) ? t(`payment.status.${status}`) : status}</Text>
    </View>
  );
}

function ResultView({ result, onDone, onRetry, onPlans }) {
  const { t, planName } = usePlanText();
  const ok = result.status === 'success';
  const retryable = ['failed', 'cancelled', 'expired'].includes(result.status);
  return (
    <View style={styles.center}>
      <Icon name={ok ? 'checkmark-circle' : result.status === 'mismatch' ? 'alert-circle-outline' : 'close-circle-outline'} size={56} color={ok ? colors.success : colors.danger} />
      <Text style={styles.bigText}>{ok ? t('subscription.youreOn', { plan: planName(result.planId, result.plan) }) : result.status === 'mismatch' ? t('subscription.needLook') : t('subscription.notCompleted')}</Text>
      <Text style={styles.bodyText}>{t.has(`payment.msg.${result.status}`) ? t(`payment.msg.${result.status}`) : result.message}</Text>
      <View style={{ width: '100%' }}>
        {ok ? <Button onPress={onDone}>{t('common.done')}</Button> : null}
        {retryable ? <Button onPress={onRetry} style={{ marginBottom: 10 }}>{t('common.tryAgain')}</Button> : null}
        {!ok ? <Button variant="outline" onPress={onPlans}>{t('subscription.backToPlans')}</Button> : null}
      </View>
      <Text style={styles.refText}>{t('subscription.reference', { ref: result.reference })}{result.mode === 'test' ? ` · ${t('subscription.testModeShort')}` : ''}</Text>
    </View>
  );
}

function PaymentHistory({ history }) {
  const { t, planName, formatRand, formatDate } = usePlanText();
  if (!history.length) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.sectionLabel}>{t('subscription.recentPayments')}</Text>
      {history.slice(0, 5).map((p) => (
        <View key={p.reference} style={styles.historyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyTitle}>{planName(p.planId, p.plan)} · {t(`subscription.cycle.${p.billingCycle}`)}</Text>
            <Text style={styles.historyMeta}>{formatDate(String(p.createdAt).slice(0, 10))} · {formatRand(p.amount)}{p.mode === 'test' ? ` · ${t('subscription.testWord')}` : ''}</Text>
          </View>
          <StatusChip status={p.status} />
        </View>
      ))}
    </View>
  );
}

function PlansView({ subscription, billingCycle, setBillingCycle, onChoosePlan, canPay, history }) {
  const { t, planName, formatRand } = usePlanText();
  const currentId = subscription.planId || 'free';
  return (
    <View>
      {subscription.expiredPlan ? (
        <View style={styles.notice}>
          <Icon name="time-outline" size={20} color={colors.warning} />
          <Text style={styles.noticeText}>{t('subscription.planEnded', { plan: planName(String(subscription.expiredPlan).toLowerCase(), subscription.expiredPlan) })}</Text>
        </View>
      ) : null}
      <View style={styles.toggleWrap}>
        {['monthly', 'annual'].map((cycle) => (
          <Pressable key={cycle} style={[styles.toggleBtn, billingCycle === cycle && styles.toggleBtnActive]} onPress={() => setBillingCycle(cycle)}>
            <Text style={[styles.toggleText, billingCycle === cycle && styles.toggleTextActive]}>{cycle === 'annual' ? t('subscription.annualSave') : t('subscription.monthly')}</Text>
          </Pressable>
        ))}
      </View>

      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentId;
        const lower = planRank(plan.id) < planRank(currentId);
        const price = planPrice(plan, billingCycle);
        return (
          <View key={plan.id} style={[styles.planCard, isCurrent && styles.planCardCurrent, plan.id === 'pro' && !isCurrent && styles.planCardPopular]}>
            {plan.id === 'pro' ? (
              <LinearGradient colors={gradient.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.popularTag}>
                <Icon name="sparkles" size={11} color={colors.white} />
                <Text style={styles.popularText}>{t('subscription.popular')}</Text>
              </LinearGradient>
            ) : null}
            <View style={styles.planHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{planName(plan.id, plan.name)}</Text>
                <Text style={styles.planTagline}>{t(`plans.${plan.id}.tagline`)}</Text>
              </View>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>{t('subscription.current')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.planPrice}>
              {formatRand(price)}
              <Text style={styles.planPricePer}>{price === 0 ? '' : `/${billingCycle === 'annual' ? t('subscription.perYear') : t('subscription.perMonth')}`}</Text>
            </Text>
            {plan.features.map((feature, i) => (
              <View key={feature} style={styles.featureRow}>
                <Icon name="checkmark-circle" size={17} color={colors.success} />
                <Text style={styles.featureText}>{t(`plans.${plan.id}.feature${i}`)}</Text>
              </View>
            ))}
            <Button
              variant={isCurrent || lower ? 'outline' : 'primary'}
              disabled={isCurrent || lower || (plan.id !== 'free' && !canPay)}
              onPress={() => onChoosePlan(plan.id)}
              style={{ marginTop: 6 }}
            >
              {isCurrent ? t('subscription.yourCurrentPlan') : lower ? (plan.id === 'free' ? planName('free', 'Free') : t('subscription.includedInPlan')) : t('subscription.subscribeTo', { name: planName(plan.id, plan.name) })}
            </Button>
          </View>
        );
      })}
      <View style={styles.secure}>
        <View style={styles.secureHead}>
          <Icon name="shield-checkmark" size={18} color={colors.success} />
          <Text style={styles.secureTitle}>{t('subscription.securedBy')}</Text>
        </View>
        <Text style={styles.secureBody}>{t('subscription.securedBody')}</Text>
        <Text style={styles.secureFoot}>{t('subscription.cancelAnytime')}</Text>
      </View>
      <PaymentHistory history={history} />
    </View>
  );
}

function ManageView({ subscription, history, canRenew, onRenew, onChangePlan, onCancel, onResume }) {
  const { t, planName, formatDate } = usePlanText();
  const pm = subscription.paymentMethod;
  return (
    <View>
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryPlan}>{t('subscription.planName', { name: planName(subscription.planId, subscription.plan) })}</Text>
          {subscription.renewsOn ? (
            <Text style={styles.summaryCycle}>{subscription.cancelAtPeriodEnd ? t('subscription.ends', { date: formatDate(subscription.renewsOn) }) : t('subscription.paidUntil', { date: formatDate(subscription.renewsOn) })}</Text>
          ) : null}
        </View>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>{subscription.cancelAtPeriodEnd ? t('subscription.ending') : t('subscription.active')}</Text>
        </View>
      </View>

      {subscription.cancelAtPeriodEnd ? (
        <View style={styles.notice}>
          <Icon name="information-circle-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noticeText}>{t('subscription.cancelledNotice', { date: formatDate(subscription.renewsOn) })}</Text>
        </View>
      ) : null}

      {pm && (
        <View style={styles.card}>
          <Icon name="card-outline" size={22} color={colors.primary} />
          <View>
            <Text style={styles.cardBrand}>{pm.brand} •••• {pm.last4}</Text>
            {pm.expiry ? <Text style={styles.cardMeta}>{t('subscription.expires', { date: pm.expiry })}</Text> : null}
          </View>
        </View>
      )}

      {canRenew ? <Button icon="refresh" onPress={onRenew} style={{ marginBottom: 10 }}>{t('subscription.renewNow')}</Button> : null}
      {subscription.cancelAtPeriodEnd ? <Button variant="outline" onPress={onResume} style={{ marginBottom: 10 }}>{t('subscription.keepMyPlan')}</Button> : null}
      <Button variant="outline" icon="swap-horizontal-outline" onPress={onChangePlan} style={{ marginBottom: 10 }}>{t('subscription.changePlan')}</Button>
      {!subscription.cancelAtPeriodEnd ? <Button variant="outline-danger" icon="close-circle-outline" onPress={onCancel}>{t('subscription.cancelSubscription')}</Button> : null}
      <PaymentHistory history={history} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 6, marginBottom: 10 },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMid,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 22,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.white, ...shadow.card },
  toggleText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  toggleTextActive: { color: colors.text },

  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  planCardCurrent: { borderColor: colors.primary, borderWidth: 2, padding: 17 },
  planCardPopular: { borderColor: colors.primary, borderWidth: 2, padding: 17, shadowColor: '#8234C6', shadowOpacity: 0.26, shadowOffset: { width: 0, height: 10 }, shadowRadius: 22, elevation: 5 },
  popularTag: { position: 'absolute', top: -12, right: 18, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 3 },
  popularText: { color: colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  secure: { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 4, marginBottom: 8 },
  secureHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  secureTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  secureBody: { fontSize: 13, lineHeight: 18, color: colors.textSoft },
  secureFoot: { fontSize: 12, color: colors.textSoft, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  planName: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  planTagline: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  currentBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  planPrice: { fontSize: 30, fontWeight: '800', color: colors.text, marginBottom: 12, letterSpacing: -0.8 },
  planPricePer: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 9 },
  featureText: { fontSize: 13.5, color: colors.textSoft, flex: 1 },

  changePlanLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  changePlanLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },

  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.dark,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 20,
  },
  summaryPlan: { color: colors.white, fontSize: 16, fontWeight: '800' },
  summaryCycle: { color: '#D9D5E4', fontSize: 12.5, marginTop: 2 },
  summaryPrice: { color: colors.white, fontSize: 20, fontWeight: '800' },
  summaryPer: { fontSize: 12, fontWeight: '600', color: '#D9D5E4' },

  activeBadge: { backgroundColor: colors.successBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
  },
  cardBrand: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  downgradeText: { flex: 1, fontSize: 13.5, color: colors.textSoft, lineHeight: 19 },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  row: { flexDirection: 'row' },
  cardNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  cardNumberInput: { flex: 1, paddingVertical: 13, fontSize: 14.5, color: colors.text },
  brandLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted, marginLeft: 6 },
  smallInput: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14.5,
    color: colors.text,
  },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 4 },
  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  secureNoteText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  testBanner: { backgroundColor: '#FFF6DB', borderRadius: radius.md, padding: 12, marginBottom: 14 },
  testBannerTitle: { fontSize: 12.5, fontWeight: '800', color: '#7A5B00' },
  testBannerText: { fontSize: 12.5, color: '#7A5B00', marginTop: 3, lineHeight: 18 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.inputBg, borderRadius: radius.md, padding: 14, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 13.5, color: colors.textSoft, lineHeight: 19 },
  center: { alignItems: 'center', paddingVertical: 18 },
  bigText: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 12, textAlign: 'center' },
  bodyText: { fontSize: 13.5, color: colors.textSoft, textAlign: 'center', marginTop: 8, lineHeight: 20, marginBottom: 18 },
  refText: { fontSize: 11.5, color: colors.textMuted, marginTop: 10, textAlign: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  historyMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  errorBox: { color: colors.danger, fontSize: 13, marginBottom: 12, lineHeight: 18 },
});
