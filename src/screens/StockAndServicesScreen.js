import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import Icon from '../components/Icon';
import { useApp } from '../context/AppContext';
import { stockStatus, customerStats } from '../lib/aiEngine';
import { colors, radius } from '../theme';

const BADGE = {
  GOOD: { bg: colors.successBg, text: colors.success, label: 'Good' },
  LOW: { bg: colors.warningBg, text: colors.warning, label: 'LOW' },
  OUT: { bg: colors.dangerBg, text: colors.danger, label: 'OUT' },
};

const EMPTY_SERVICE = { name: '', price: '', duration: '', category: '' };
const EMPTY_CUSTOMER = { name: '', phone: '', email: '' };

export default function StockAndServicesScreen({ navigation }) {
  const {
    state,
    addStock,
    deleteProduct,
    addService,
    updateService,
    deleteService,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  } = useApp();

  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');

  // Products
  const [newProduct, setNewProduct] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newAmount, setNewAmount] = useState('');

  // Services
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const setService = (key) => (value) => setServiceForm((f) => ({ ...f, [key]: value }));

  // Customers
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const setCustomer = (key) => (value) => setCustomerForm((f) => ({ ...f, [key]: value }));

  const filteredProducts = useMemo(
    () => state.products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [state.products, query]
  );
  const filteredServices = useMemo(
    () => state.services.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [state.services, query]
  );
  const filteredCustomers = useMemo(
    () => state.customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [state.customers, query]
  );

  const handleAddStock = () => {
    addStock({ product: newProduct, quantity: newQuantity, amount: newAmount });
    setNewProduct('');
    setNewQuantity('');
    setNewAmount('');
  };

  const saveService = () => {
    const service = {
      name: serviceForm.name.trim(),
      price: Number(serviceForm.price || 0),
      duration: serviceForm.duration.trim(),
      category: serviceForm.category.trim() || 'General',
    };
    if (!service.name || !service.price || !service.duration) return;
    if (editingServiceId) updateService(editingServiceId, service);
    else addService(service);
    setServiceForm(EMPTY_SERVICE);
    setEditingServiceId(null);
  };

  const saveCustomer = () => {
    if (!customerForm.name.trim()) return;
    const value = { ...customerForm, name: customerForm.name.trim() };
    if (editingCustomerId) updateCustomer(editingCustomerId, value);
    else addCustomer(value);
    setCustomerForm(EMPTY_CUSTOMER);
    setEditingCustomerId(null);
  };

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>Stock & Services</Text>
        <Text style={styles.subtitle}>Manage products, services and customers</Text>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search products or services"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <SegmentedControl
        options={[
          { value: 'products', label: 'Products' },
          { value: 'services', label: 'Services' },
          { value: 'customers', label: 'Customers' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'products' && (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add new stock</Text>
            <Input placeholder="Product" value={newProduct} onChangeText={setNewProduct} />
            <Input placeholder="Quantity" keyboardType="numeric" value={newQuantity} onChangeText={setNewQuantity} />
            <Input placeholder="Amount used" keyboardType="decimal-pad" value={newAmount} onChangeText={setNewAmount} />
            <Button size="sm" onPress={handleAddStock} disabled={!newProduct.trim() || !newQuantity || !newAmount}>
              Add stock
            </Button>
          </View>

          <Text style={styles.sectionTitle}>Products</Text>
          {filteredProducts.length ? (
            filteredProducts.map((p) => {
              const status = stockStatus(p);
              const badge = BADGE[status];
              return (
                <Pressable
                  key={p.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('PricingAssistant', { productId: p.id })}
                >
                  <View>
                    <Text style={styles.rowTitle}>{p.name}</Text>
                    <Text style={styles.rowMeta}>{p.category} · {p.stock} in stock</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                    <Pressable onPress={(e) => { e.stopPropagation(); deleteProduct(p.id); }}>
                      <Icon name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.empty}>No products yet.</Text>
          )}
        </>
      )}

      {tab === 'services' && (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingServiceId ? 'Edit service' : 'Add a service'}</Text>
            <Input placeholder="Service name" value={serviceForm.name} onChangeText={setService('name')} />
            <Input placeholder="Price" keyboardType="decimal-pad" value={serviceForm.price} onChangeText={setService('price')} />
            <Input placeholder="Duration (e.g. 60 minutes)" value={serviceForm.duration} onChangeText={setService('duration')} />
            <Input placeholder="Category" value={serviceForm.category} onChangeText={setService('category')} />
            <Button size="sm" onPress={saveService} disabled={!serviceForm.name || !serviceForm.price || !serviceForm.duration}>
              {editingServiceId ? 'Save changes' : 'Add service'}
            </Button>
            {editingServiceId && (
              <Button size="sm" variant="outline-accent" onPress={() => { setEditingServiceId(null); setServiceForm(EMPTY_SERVICE); }}>
                Cancel editing
              </Button>
            )}
          </View>

          <Text style={styles.sectionTitle}>Popular Services</Text>
          {filteredServices.length ? (
            filteredServices.map((s) => (
              <View style={styles.row} key={s.id}>
                <View>
                  <Text style={styles.rowTitle}>{s.name}</Text>
                  <Text style={styles.rowMeta}>{s.category} · {s.duration}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.price}>R{Number(s.price).toFixed(0)}</Text>
                  <Pressable onPress={() => { setEditingServiceId(s.id); setServiceForm({ name: s.name, price: String(s.price), duration: s.duration, category: s.category }); }}>
                    <Icon name="create-outline" size={16} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => deleteService(s.id)}>
                    <Icon name="trash-outline" size={16} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No services yet.</Text>
          )}
        </>
      )}

      {tab === 'customers' && (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingCustomerId ? 'Edit customer' : 'Add customer'}</Text>
            <Input placeholder="Customer name" value={customerForm.name} onChangeText={setCustomer('name')} />
            <Input placeholder="Phone number" keyboardType="phone-pad" value={customerForm.phone} onChangeText={setCustomer('phone')} />
            <Input placeholder="Email address" keyboardType="email-address" value={customerForm.email} onChangeText={setCustomer('email')} />
            <Button size="sm" onPress={saveCustomer} disabled={!customerForm.name}>
              {editingCustomerId ? 'Save customer' : 'Add customer'}
            </Button>
            {editingCustomerId && (
              <Button size="sm" variant="outline-accent" onPress={() => { setEditingCustomerId(null); setCustomerForm(EMPTY_CUSTOMER); }}>
                Cancel editing
              </Button>
            )}
          </View>

          <Text style={styles.sectionTitle}>Customers</Text>
          {filteredCustomers.length ? (
            filteredCustomers.map((c) => {
              const stats = customerStats(c, state.upcomingWork, state.services);
              return (
                <View style={styles.row} key={c.id}>
                  <View>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>
                      {stats.visits} visit{stats.visits === 1 ? '' : 's'} · R{stats.totalSpent.toFixed(0)} spent
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Pressable onPress={() => { setEditingCustomerId(c.id); setCustomerForm({ name: c.name, phone: c.phone || '', email: c.email || '' }); }}>
                      <Icon name="create-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => deleteCustomer(c.id)}>
                      <Icon name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>No customers yet.</Text>
          )}

          <View style={{ height: 8 }} />
          <Button variant="outline-accent" icon="calendar-outline" onPress={() => navigation.navigate('Operations')}>
            Manage bookings
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  form: { padding: 14, backgroundColor: colors.inputBg, borderRadius: radius.md, marginBottom: 20, gap: 8 },
  formTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  price: { fontSize: 14, fontWeight: '800', color: colors.success },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
