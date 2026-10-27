import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import Banner from '../components/Banner';
import ConfirmDialog from '../components/ConfirmDialog';
import SegmentedControl from '../components/SegmentedControl';
import AddStockForm from '../components/AddStockForm';
import ProductRow from '../components/ProductRow';
import ProductEditSheet from '../components/ProductEditSheet';
import ServiceManager from '../components/ServiceManager';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import { useBanner } from '../components/useBanner';
import { useApp } from '../context/AppContext';
import { customerHistory } from '../lib/bookings';
import CustomerHistorySheet from '../components/CustomerHistorySheet';
import { isEmail } from '../lib/numbers';
import { normalizePhone } from '../lib/schedule';
import { colors, radius, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

const EMPTY_CUSTOMER = { name: '', phone: '', email: '' };

// The Stock & Services tab for hybrid businesses: products (stock), services and customers.
export default function StockAndServicesScreen({ navigation }) {
  const { t, formatMoney } = useTranslation();
  const { state, addCustomer, updateCustomer, deleteCustomer , reloadData } = useApp();
  const scrollRef = useRef(null);
  const toTop = () => scrollRef.current?.scrollTo?.({ y: 0, animated: true });

  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');
  const [editingProductId, setEditingProductId] = useState(null);

  // Customers
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [customerErrors, setCustomerErrors] = useState({});
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [confirmCustomer, setConfirmCustomer] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const { banner, show, clear } = useBanner();
  const setCustomer = (key) => (value) => {
    setCustomerForm((f) => ({ ...f, [key]: value }));
    if (customerErrors[key]) setCustomerErrors((e) => ({ ...e, [key]: undefined }));
  };

  const q = query.trim().toLowerCase();
  const filteredProducts = useMemo(
    () => state.products.filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)),
    [state.products, q]
  );
  const filteredCustomers = useMemo(
    () =>
      state.customers
        .filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.phone || '').includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.customers, q]
  );

  const resetCustomer = () => {
    setCustomerForm(EMPTY_CUSTOMER);
    setEditingCustomerId(null);
    setCustomerErrors({});
  };

  const saveCustomer = async () => {
    if (savingCustomer) return;
    const value = { name: customerForm.name.replace(/\s+/g, ' ').trim(), phone: customerForm.phone.trim(), email: customerForm.email.trim() };
    const errors = {};
    if (!value.name) errors.name = t('customers.errName');
    if (value.email && !isEmail(value.email)) errors.email = t('customers.errEmail');
    if (value.phone && !normalizePhone(value.phone)) errors.phone = t('customers.errPhone');
    setCustomerErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingCustomer(true);
    const result = editingCustomerId ? await updateCustomer(editingCustomerId, value) : await addCustomer(value);
    setSavingCustomer(false);
    if (!result?.ok) return show('error', result?.error || t('operations.couldntSaveCustomer'));
    show('success', editingCustomerId ? t('operations.customerUpdated') : t('operations.customerAdded'));
    resetCustomer();
  };

  const removeCustomer = async () => {
    const target = confirmCustomer;
    setConfirmCustomer(null);
    const result = await deleteCustomer(target.id);
    if (!result?.ok) return show('error', result?.error || t('sync.couldnTDeleteTheCustomer'));
    if (editingCustomerId === target.id) resetCustomer();
    show('success', t('customers.deleted', { name: target.name }));
  };

  const searchPlaceholder =
    tab === 'customers' ? t('customers.search') : tab === 'services' ? t('services.search') : t('searchProduct');
  const editingProduct = state.products.find((p) => p.id === editingProductId) || null;

  return (
    <Screen scrollRef={scrollRef} onRefresh={reloadData}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('stockAndServices.stockServices')}</Text>
        <Text style={styles.subtitle}>{t('stockAndServices.manageProductsServicesAndCustomers')}</Text>
      </View>

      <SegmentedControl
        options={[
          { value: 'products', label: t('common.products') },
          { value: 'services', label: t('navServices') },
          { value: 'customers', label: t('stockAndServices.customers') },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setQuery('');
          clear();
        }}
      />

      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={searchPlaceholder}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.clearSearch')}>
            <Icon name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {tab === 'products' && (
        <>
          <AddStockForm />
          <Text style={styles.sectionTitle}>
            {t('common.products')}
            {state.products.length ? ` (${state.products.length})` : ''}
          </Text>
          {filteredProducts.length ? (
            filteredProducts.map((p) => <ProductRow key={p.id} product={p} onPress={() => setEditingProductId(p.id)} />)
          ) : (
            state.products.length ? (
              <EmptyState compact icon="search-outline" title={t('stockManagement.noProductsMatchThisFilter')} />
            ) : (
              <EmptyState icon="cube-outline" title={t('stockAndServices.noProductsYet')} />
            )
          )}
        </>
      )}

      {tab === 'services' && <ServiceManager query={query} onEditStart={toTop} />}

      {tab === 'customers' && (
        <>
          <View style={styles.card}>
            <Text style={styles.formTitle}>{editingCustomerId ? t('operations.editCustomer') : t('operations.addCustomer')}</Text>
            <Banner type={banner?.type} text={banner?.text} onClose={clear} />
            <Input label={t('operations.name')} placeholder={t('common.customerName')} value={customerForm.name} onChangeText={setCustomer('name')} error={customerErrors.name} />
            <Input label={t('operations.phone')} placeholder={t('phoneNumber')} keyboardType="phone-pad" value={customerForm.phone} onChangeText={setCustomer('phone')} error={customerErrors.phone} hint={t('customers.phoneHint')} />
            <Input
              label={t('email')}
              placeholder={t('common.emailAddress')}
              keyboardType="email-address"
              autoCapitalize="none"
              value={customerForm.email}
              onChangeText={setCustomer('email')}
              error={customerErrors.email}
            />
            <Button onPress={saveCustomer} loading={savingCustomer} disabled={savingCustomer}>
              {editingCustomerId ? t('operations.saveCustomer') : t('operations.addCustomer')}
            </Button>
            {editingCustomerId && (
              <Button variant="outline-accent" onPress={resetCustomer} style={{ marginTop: 10 }}>
                {t('common.cancelEditing')}
              </Button>
            )}
          </View>

          <Text style={styles.sectionTitle}>
            {t('stockAndServices.customers')}
            {state.customers.length ? ` (${state.customers.length})` : ''}
          </Text>
          {filteredCustomers.length ? (
            filteredCustomers.map((c) => {
              const h = customerHistory(c.id, state.upcomingWork, { services: state.services, transactions: state.transactions });
              return (
                <View style={styles.row} key={c.id}>
                  <Pressable style={{ flex: 1, paddingRight: 8 }} onPress={() => setHistoryFor(c)} accessibilityRole="button" accessibilityLabel={t('booking.openHistory', { name: c.name })}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>{c.phone || c.email || t('operations.noContact')}</Text>
                    <Text style={styles.rowMeta}>
                      {[
                        t('booking.visitsCount', { count: h.visits }),
                        h.upcoming ? t('booking.upcomingCount', { count: h.upcoming }) : null,
                        h.missed ? t('booking.missedCount', { count: h.missed }) : null,
                      ].filter(Boolean).join(' · ')}
                      {h.spent ? ` · ${t('booking.spent', { amount: formatMoney(h.spent, { decimals: 0 }) })}` : ''}
                    </Text>
                  </Pressable>
                  <View style={styles.rowRight}>
                    <Pressable
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('customers.editName', { name: c.name })}
                      onPress={() => {
                        clear();
                        setCustomerErrors({});
                        setEditingCustomerId(c.id);
                        setCustomerForm({ name: c.name, phone: c.phone || '', email: c.email || '' });
                        toTop();
                      }}
                    >
                      <Icon name="create-outline" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={t('customers.deleteName', { name: c.name })} onPress={() => setConfirmCustomer(c)}>
                      <Icon name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            state.customers.length ? (
              <EmptyState compact icon="search-outline" title={t('customers.noMatch')} />
            ) : (
              <EmptyState icon="people-outline" title={t('common.noCustomersYet')} body={t('empty.customersBody')} />
            )
          )}

          <View style={{ height: 12 }} />
          <Button variant="outline-accent" icon="calendar-outline" onPress={() => navigation.navigate('Operations')}>{t('stockAndServices.manageBookings')}</Button>
        </>
      )}

      <CustomerHistorySheet
        customer={historyFor}
        visible={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        onBook={() => {
          setHistoryFor(null);
          navigation.navigate('Operations', { view: 'work' });
        }}
      />
      <ProductEditSheet product={editingProduct} visible={Boolean(editingProduct)} onClose={() => setEditingProductId(null)} navigation={navigation} />
      <ConfirmDialog
        visible={Boolean(confirmCustomer)}
        title={t('operations.deleteCustomer')}
        message={t('operations.confirmDeleteCustomer', { name: confirmCustomer?.name })}
        onConfirm={removeCustomer}
        onCancel={() => setConfirmCustomer(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 14 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  card: { padding: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, marginBottom: 20 },
  formTitle: type.formTitle,
  sectionTitle: type.sectionTitle,
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
