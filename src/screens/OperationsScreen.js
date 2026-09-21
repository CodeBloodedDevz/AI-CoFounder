import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { colors, radius } from '../theme';
import BackButton from '../components/BackButton';

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const EMPTY_CUSTOMER = { name: '', phone: '', email: '' };
const EMPTY_WORK = { title: '', service: '', customerId: '', date: '', time: '', status: 'Pending' };

export default function OperationsScreen({ navigation }) {
  const { state, addCustomer, updateCustomer, deleteCustomer, addUpcomingWork, updateUpcomingWork, deleteUpcomingWork } = useApp();
  const [view, setView] = useState('customers');
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [workForm, setWorkForm] = useState(EMPTY_WORK);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editingWorkId, setEditingWorkId] = useState(null);

  const setCustomer = (key) => (value) => setCustomerForm((current) => ({ ...current, [key]: value }));
  const setWork = (key) => (value) => setWorkForm((current) => ({ ...current, [key]: value }));

  const saveCustomer = () => {
    if (!customerForm.name.trim()) return;
    const value = { ...customerForm, name: customerForm.name.trim() };
    if (editingCustomerId) updateCustomer(editingCustomerId, value);
    else addCustomer(value);
    setCustomerForm(EMPTY_CUSTOMER);
    setEditingCustomerId(null);
  };

  const saveWork = () => {
    if (!workForm.title.trim() || !workForm.date.trim()) return;
    const value = { ...workForm, title: workForm.title.trim(), date: workForm.date.trim() };
    if (editingWorkId) updateUpcomingWork(editingWorkId, value);
    else addUpcomingWork(value);
    setWorkForm(EMPTY_WORK);
    setEditingWorkId(null);
  };

  const editCustomer = (customer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
  };

  const editWork = (work) => {
    setEditingWorkId(work.id);
    setWorkForm({
      title: work.title || '',
      service: work.service || '',
      customerId: work.customerId || '',
      date: work.date || '',
      time: work.time || '',
      status: work.status || 'Pending',
    });
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>Customers & work</Text>
        <Text style={styles.subtitle}>Keep customer details and scheduled work together.</Text>
      </View>

      <View style={styles.tabs}>
        {['customers', 'work'].map((key) => (
          <Pressable key={key} onPress={() => setView(key)} style={[styles.tab, view === key && styles.tabActive]}>
            <Text style={[styles.tabText, view === key && styles.tabTextActive]}>{key === 'customers' ? 'Customers' : 'Upcoming work'}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'customers' ? (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingCustomerId ? 'Edit customer' : 'Add customer'}</Text>
            <Input label="Name" placeholder="Customer name" value={customerForm.name} onChangeText={setCustomer('name')} />
            <Input label="Phone" keyboardType="phone-pad" placeholder="Phone number" value={customerForm.phone} onChangeText={setCustomer('phone')} />
            <Input label="Email" keyboardType="email-address" placeholder="Email address" value={customerForm.email} onChangeText={setCustomer('email')} />
            <Button onPress={saveCustomer} disabled={!customerForm.name}>{editingCustomerId ? 'Save customer' : 'Add customer'}</Button>
            {editingCustomerId && <Button variant="outline-accent" onPress={() => { setEditingCustomerId(null); setCustomerForm(EMPTY_CUSTOMER); }}>Cancel editing</Button>}
          </View>
          <Text style={styles.sectionTitle}>Customer list</Text>
          {state.customers.length ? state.customers.map((customer) => (
            <View style={styles.row} key={customer.id}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{customer.name}</Text>
                <Text style={styles.rowMeta}>{customer.phone || customer.email || 'No contact details'}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => editCustomer(customer)}><Text style={styles.actionText}>Edit</Text></Pressable>
                <Pressable onPress={() => deleteCustomer(customer.id)}><Text style={styles.deleteText}>Delete</Text></Pressable>
              </View>
            </View>
          )) : <Text style={styles.empty}>No customers yet.</Text>}
        </>
      ) : (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingWorkId ? 'Edit upcoming work' : 'Schedule work'}</Text>
            <Input label="Work title" placeholder="e.g. Initial consultation" value={workForm.title} onChangeText={setWork('title')} />
            <Select label="Service" placeholder="Select a service" options={state.services.map((service) => service.name)} value={workForm.service} onChange={setWork('service')} />
            <Select label="Customer" placeholder="Assign a customer" options={state.customers.map((customer) => customer.name)} value={state.customers.find((customer) => customer.id === workForm.customerId)?.name || ''} onChange={(name) => setWork('customerId')(state.customers.find((customer) => customer.name === name)?.id || '')} />
            <Input label="Date" placeholder="YYYY-MM-DD" value={workForm.date} onChangeText={setWork('date')} />
            <Input label="Time" placeholder="e.g. 14:30" value={workForm.time} onChangeText={setWork('time')} />
            <Select label="Status" options={STATUSES} value={workForm.status} onChange={setWork('status')} />
            <Button onPress={saveWork} disabled={!workForm.title || !workForm.date}>{editingWorkId ? 'Save work' : 'Schedule work'}</Button>
            {editingWorkId && <Button variant="outline-accent" onPress={() => { setEditingWorkId(null); setWorkForm(EMPTY_WORK); }}>Cancel editing</Button>}
          </View>
          <Text style={styles.sectionTitle}>Upcoming work</Text>
          {state.upcomingWork.length ? state.upcomingWork.map((work) => (
            <View style={styles.row} key={work.id}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{work.title}</Text>
                <Text style={styles.rowMeta}>{work.date}{work.time ? ` at ${work.time}` : ''} · {work.status}</Text>
                <Text style={styles.rowMeta}>{state.customers.find((customer) => customer.id === work.customerId)?.name || 'No customer assigned'}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => editWork(work)}><Text style={styles.actionText}>Edit</Text></Pressable>
                <Pressable onPress={() => deleteUpcomingWork(work.id)}><Text style={styles.deleteText}>Delete</Text></Pressable>
              </View>
            </View>
          )) : <Text style={styles.empty}>No upcoming work scheduled.</Text>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 12.5 },
  tabTextActive: { color: colors.white },
  form: { padding: 14, backgroundColor: colors.inputBg, borderRadius: radius.md, marginBottom: 22 },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowInfo: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
