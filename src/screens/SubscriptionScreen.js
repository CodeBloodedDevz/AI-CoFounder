import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import Input from '../components/Input';
import BackButton from '../components/BackButton';
import Icon from '../components/Icon';
import { useApp } from '../context/AppContext';
import { colors, radius, shadow } from '../theme';
import {
  PLANS,
  getPlan,
  planPrice,
  isValidCardNumber,
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  isValidExpiry,
  isValidCvv,
  last4,
} from '../lib/payment';

const BRAND_ICON = {
  Visa: 'card-outline',
  Mastercard: 'card-outline',
  Amex: 'card-outline',
  Discover: 'card-outline',
  Card: 'card-outline',
};

export default function SubscriptionScreen({ navigation }) {
  const { state, subscribe, cancelSubscription } = useApp();
  const subscription = state.subscription || { planId: 'free', plan: 'Free' };
  const isPaidActive = subscription.planId && subscription.planId !== 'free' && subscription.status === 'active';

  const [mode, setMode] = useState(isPaidActive ? 'manage' : 'plans');
  const [billingCycle, setBillingCycle] = useState(subscription.billingCycle || 'monthly');
  const [selectedPlanId, setSelectedPlanId] = useState(subscription.planId === 'free' ? 'pro' : subscription.planId || 'pro');

  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const selectedPlan = getPlan(selectedPlanId);
  const brand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);

  const goToPlans = () => setMode('plans');
  const choosePlan = (planId) => {
    setSelectedPlanId(planId);
    setMode(planId === 'free' ? 'confirmDowngrade' : 'payment');
  };

  const validate = () => {
    const next = {};
    if (!cardholderName.trim()) next.cardholderName = 'Enter the name on the card.';
    if (!isValidCardNumber(cardNumber)) next.cardNumber = 'Enter a valid card number.';
    if (!isValidExpiry(expiry)) next.expiry = 'Enter a valid, unexpired date (MM/YY).';
    if (!isValidCvv(cvv, brand)) next.cvv = `Enter the ${brand === 'Amex' ? '4' : '3'}-digit security code.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubscribe = () => {
    if (!validate()) return;
    setSubmitting(true);
    // Simulated processing — this app has no backend/payment gateway.
    setTimeout(() => {
      subscribe({
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        billingCycle,
        card: {
          brand,
          last4: last4(cardNumber),
          expiry,
          cardholderName: cardholderName.trim(),
        },
      });
      setSubmitting(false);
      setCardNumber('');
      setCvv('');
      setMode('manage');
    }, 600);
  };

  const handleDowngrade = () => {
    cancelSubscription();
    setMode('plans');
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel subscription?',
      `You'll move to the Free plan${subscription.renewsOn ? ` at the end of your current billing period (${subscription.renewsOn})` : ''}.`,
      [
        { text: 'Keep plan', style: 'cancel' },
        { text: 'Cancel subscription', style: 'destructive', onPress: handleDowngrade },
      ]
    );
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>Subscription</Text>
        <Text style={styles.subtitle}>Choose the plan that fits how your business runs.</Text>
      </View>

      {mode === 'manage' && (
        <ManageView
          subscription={subscription}
          onChangePlan={goToPlans}
          onCancel={confirmCancel}
        />
      )}

      {mode === 'plans' && (
        <PlansView
          currentPlanId={subscription.planId}
          billingCycle={billingCycle}
          setBillingCycle={setBillingCycle}
          onChoosePlan={choosePlan}
        />
      )}

      {mode === 'confirmDowngrade' && (
        <View>
          <View style={styles.card}>
            <Icon name="information-circle-outline" size={22} color={colors.textMuted} />
            <Text style={styles.downgradeText}>
              Switching to the Free plan will remove Pro/Premium features at the end of your current billing period.
            </Text>
          </View>
          <Button variant="outline" onPress={goToPlans} style={{ marginBottom: 10 }}>
            Go back
          </Button>
          <Button variant="primary" onPress={handleDowngrade}>
            Confirm switch to Free
          </Button>
        </View>
      )}

      {mode === 'payment' && (
        <View>
          <Pressable onPress={goToPlans} style={styles.changePlanLink}>
            <Icon name="chevron-back-outline" size={15} color={colors.primary} />
            <Text style={styles.changePlanLinkText}>Choose a different plan</Text>
          </Pressable>

          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryPlan}>{selectedPlan.name} plan</Text>
              <Text style={styles.summaryCycle}>{billingCycle === 'annual' ? 'Billed annually' : 'Billed monthly'}</Text>
            </View>
            <Text style={styles.summaryPrice}>
              R{planPrice(selectedPlan, billingCycle).toFixed(0)}
              <Text style={styles.summaryPer}>/{billingCycle === 'annual' ? 'yr' : 'mo'}</Text>
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Payment method</Text>

          <Input
            label="Cardholder name"
            value={cardholderName}
            onChangeText={setCardholderName}
            placeholder="Name as shown on card"
            autoCapitalize="words"
            error={errors.cardholderName}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Card number</Text>
            <View style={styles.cardNumberWrap}>
              <Icon name={BRAND_ICON[brand]} size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.cardNumberInput}
                value={cardNumber}
                onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={23}
              />
              {cardNumber.length > 0 && <Text style={styles.brandLabel}>{brand}</Text>}
            </View>
            {errors.cardNumber ? <Text style={styles.errorText}>{errors.cardNumber}</Text> : null}
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Expiry (MM/YY)</Text>
              <TextInput
                style={styles.smallInput}
                value={expiry}
                onChangeText={(text) => setExpiry(formatExpiry(text))}
                placeholder="MM/YY"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={5}
              />
              {errors.expiry ? <Text style={styles.errorText}>{errors.expiry}</Text> : null}
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>CVV</Text>
              <TextInput
                style={styles.smallInput}
                value={cvv}
                onChangeText={(text) => setCvv(text.replace(/\D/g, '').slice(0, 4))}
                placeholder={brand === 'Amex' ? '1234' : '123'}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
              />
              {errors.cvv ? <Text style={styles.errorText}>{errors.cvv}</Text> : null}
            </View>
          </View>

          <View style={styles.secureNote}>
            <Icon name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={styles.secureNoteText}>Only your card's brand, last 4 digits and expiry are saved.</Text>
          </View>

          <Button
            icon="checkmark-circle-outline"
            loading={submitting}
            disabled={submitting}
            onPress={handleSubscribe}
          >
            Confirm & Subscribe
          </Button>
        </View>
      )}
    </Screen>
  );
}

function PlansView({ currentPlanId, billingCycle, setBillingCycle, onChoosePlan }) {
  return (
    <View>
      <View style={styles.toggleWrap}>
        {['monthly', 'annual'].map((cycle) => (
          <Pressable
            key={cycle}
            style={[styles.toggleBtn, billingCycle === cycle && styles.toggleBtnActive]}
            onPress={() => setBillingCycle(cycle)}
          >
            <Text style={[styles.toggleText, billingCycle === cycle && styles.toggleTextActive]}>
              {cycle === 'annual' ? 'Annual · save ~20%' : 'Monthly'}
            </Text>
          </Pressable>
        ))}
      </View>

      {PLANS.map((plan) => {
        const isCurrent = plan.id === (currentPlanId || 'free');
        const price = planPrice(plan, billingCycle);
        return (
          <View key={plan.id} style={[styles.planCard, isCurrent && styles.planCardCurrent]}>
            <View style={styles.planHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planTagline}>{plan.tagline}</Text>
              </View>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>

            <Text style={styles.planPrice}>
              {price === 0 ? 'R0' : `R${price.toFixed(0)}`}
              <Text style={styles.planPricePer}>{price === 0 ? '' : `/${billingCycle === 'annual' ? 'yr' : 'mo'}`}</Text>
            </Text>

            {plan.features.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Icon name="checkmark-outline" size={15} color={colors.success} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}

            <Button
              variant={isCurrent ? 'outline' : 'primary'}
              disabled={isCurrent}
              onPress={() => onChoosePlan(plan.id)}
              style={{ marginTop: 6 }}
            >
              {isCurrent ? 'Your current plan' : plan.id === 'free' ? 'Switch to Free' : `Subscribe to ${plan.name}`}
            </Button>
          </View>
        );
      })}
    </View>
  );
}

function ManageView({ subscription, onChangePlan, onCancel }) {
  const pm = subscription.paymentMethod;
  return (
    <View>
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryPlan}>{subscription.plan} plan</Text>
          {subscription.renewsOn ? <Text style={styles.summaryCycle}>Renews {subscription.renewsOn}</Text> : null}
        </View>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>Active</Text>
        </View>
      </View>

      {pm && (
        <View style={styles.card}>
          <Icon name="card-outline" size={22} color={colors.primary} />
          <View>
            <Text style={styles.cardBrand}>
              {pm.brand} •••• {pm.last4}
            </Text>
            <Text style={styles.cardMeta}>
              Expires {pm.expiry} · {pm.cardholderName}
            </Text>
          </View>
        </View>
      )}

      <Button variant="outline" icon="swap-horizontal-outline" onPress={onChangePlan} style={{ marginBottom: 10 }}>
        Change plan
      </Button>
      <Button variant="outline-danger" icon="close-circle-outline" onPress={onCancel}>
        Cancel subscription
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 6, marginBottom: 10 },

  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 18,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.white, ...shadow.card },
  toggleText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  toggleTextActive: { color: colors.text },

  planCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  planCardCurrent: { borderColor: colors.primary },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  planName: { fontSize: 17, fontWeight: '800', color: colors.text },
  planTagline: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  currentBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  planPrice: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 12 },
  planPricePer: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
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
});
