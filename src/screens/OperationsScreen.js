import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import DateField from '../components/DateField';
import TimeField from '../components/TimeField';
import WorkRow, { STATUS_COLORS } from '../components/WorkRow';
import FollowUpCard from '../components/FollowUpCard';
import FollowUpSheet from '../components/FollowUpSheet';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useContactLog } from '../hooks/useContactLog';
import { colors, radius } from '../theme';
import BackButton from '../components/BackButton';
import { customerStats } from '../lib/aiEngine';
import { WORK_STATUSES, followUpMessage, splitWork, validateWork } from '../lib/schedule';

const EMPTY_CUSTOMER = { name: '', phone: '', email: '' };
const EMPTY_WORK = { title: '', service: '', customerId: '', date: '', time: '', status: 'Pending' };

export default function OperationsScreen({ navigation, route }) {
  const { state, addCustomer, updateCustomer, deleteCustomer, addUpcomingWork, updateUpcomingWork, deleteUpcomingWork } = useApp();
  const [view, setView] = useState(route?.params?.view === 'work' ? 'work' : 'customers');
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [workForm, setWorkForm] = useState(EMPTY_WORK);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editingWorkId, setEditingWorkId] = useState(null);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { customer, text, title }
  const [confirm, setConfirm] = useState(null); // { kind: 'work' | 'customer', id, name }
  const { markContacted } = useContactLog(navigation);
  const bannerTimer = useRef(null);

  // Opened from the home screen's "Upcoming work" / "Customers to follow up".
  const requestedView = route?.params?.view;
  useEffect(() => {
    if (requestedView === 'work' || requestedView === 'customers') setView(requestedView);
  }, [requestedView]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const show = (type, text) => {
    clearTimeout(bannerTimer.current);
    setBanner({ type, text });
    if (type === 'success') bannerTimer.current = setTimeout(() => setBanner(null), 3500);
  };

  const setCustomer = (key) => (value) => setCustomerForm((current) => ({ ...current, [key]: value }));
  const setWork = (key) => (value) => {
    setWorkForm((current) => ({ ...current, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const customerName = (id) => state.customers.find((c) => c.id === id)?.name;
  const { upcoming, past } = useMemo(() => splitWork(state.upcomingWork), [state.upcomingWork]);

  /* ---------- customers ---------- */

  const saveCustomer = async () => {
    if (!customerForm.name.trim() || saving) return;
    const value = { ...customerForm, name: customerForm.name.trim() };
    setSaving(true);
    const result = editingCustomerId ? await updateCustomer(editingCustomerId, value) : await addCustomer(value);
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || "Couldn't save the customer.");
    show('success', editingCustomerId ? 'Customer updated.' : 'Customer added.');
    setCustomerForm(EMPTY_CUSTOMER);
    setEditingCustomerId(null);
  };

  const editCustomer = (customer) => {
    setBanner(null);
    setEditingCustomerId(customer.id);
    setCustomerForm({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
  };

  /* ---------- appointments ---------- */

  const saveWork = async () => {
    if (saving) return;
    // A service alone is enough of a title ("Haircut").
    const form = { ...workForm, title: workForm.title.trim() || workForm.service };
    const checked = validateWork(form);
    setErrors(checked.errors);
    if (!checked.ok) return show('error', 'Please fix the highlighted fields.');

    setSaving(true);
    const result = editingWorkId ? await updateUpcomingWork(editingWorkId, checked.value) : await addUpcomingWork(checked.value);
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || "Couldn't save the appointment. Please try again.");

    show('success', editingWorkId ? 'Appointment updated.' : 'Appointment scheduled.');
    setWorkForm(EMPTY_WORK);
    setEditingWorkId(null);
    setErrors({});
  };

  const editWork = (work) => {
    setBanner(null);
    setErrors({});
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

  const markDone = async (work) => {
    const result = await updateUpcomingWork(work.id, { status: 'Completed' });
    if (result?.ok) show('success', 'Marked as completed.');
    else show('error', result?.error || "Couldn't update the appointment.");
  };

  const remind = (work) => {
    const customer = state.customers.find((c) => c.id === work.customerId);
    if (!customer) return;
    setMessage({
      customer,
      title: 'Send a reminder',
      text: followUpMessage({ kind: 'reminder', customerName: customer.name, businessName: state.business?.name, work }),
    });
  };

  const followUp = (customer) => {
    const last = state.upcomingWork
      .filter((w) => w.customerId === customer.id && w.status === 'Completed')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .pop();
    setMessage({
      customer,
      title: 'Send a follow-up',
      text: followUpMessage({ kind: 'followup', customerName: customer.name, businessName: state.business?.name, service: last?.service }),
    });
  };

  const confirmDelete = async () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    if (target.kind === 'work') {
      const result = await deleteUpcomingWork(target.id);
      if (!result?.ok) show('error', result?.error || "Couldn't delete the appointment.");
      else show('success', 'Appointment deleted.');
    } else {
      await deleteCustomer(target.id);
    }
  };

  const renderWork = (work, isUpcoming) => (
    <WorkRow
      key={work.id}
      work={work}
      customerName={customerName(work.customerId)}
      right={
        <View style={styles.rowActions}>
          <Text style={[styles.status, { color: STATUS_COLORS[work.status] || colors.primary }]}>{work.status}</Text>
          <Pressable onPress={() => editWork(work)}><Text style={styles.actionText}>Edit</Text></Pressable>
          {['Pending', 'Confirmed'].includes(work.status) ? (
            <Pressable onPress={() => markDone(work)}><Text style={styles.actionText}>Done</Text></Pressable>
          ) : null}
          {isUpcoming && work.customerId ? (
            <Pressable onPress={() => remind(work)}><Text style={styles.actionText}>Remind</Text></Pressable>
          ) : null}
          <Pressable onPress={() => setConfirm({ kind: 'work', id: work.id, name: work.title || work.service })}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      }
    />
  );

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>Customers & work</Text>
        <Text style={styles.subtitle}>Keep customer details and scheduled work together.</Text>
      </View>

      <View style={styles.tabs}>
        {['customers', 'work'].map((key) => (
          <Pressable key={key} onPress={() => { setView(key); setBanner(null); }} style={[styles.tab, view === key && styles.tabActive]}>
            <Text style={[styles.tabText, view === key && styles.tabTextActive]}>{key === 'customers' ? 'Customers' : 'Upcoming work'}</Text>
          </Pressable>
        ))}
      </View>

      {banner ? (
        <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]} accessibilityRole="alert">
          <Text style={[styles.bannerText, { color: banner.type === 'error' ? colors.danger : colors.success }]}>{banner.text}</Text>
        </View>
      ) : null}

      {view === 'customers' ? (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingCustomerId ? 'Edit customer' : 'Add customer'}</Text>
            <Input label="Name" placeholder="Customer name" value={customerForm.name} onChangeText={setCustomer('name')} />
            <Input label="Phone" keyboardType="phone-pad" placeholder="Phone number" value={customerForm.phone} onChangeText={setCustomer('phone')} />
            <Input label="Email" keyboardType="email-address" placeholder="Email address" value={customerForm.email} onChangeText={setCustomer('email')} />
            <Button onPress={saveCustomer} disabled={!customerForm.name} loading={saving}>{editingCustomerId ? 'Save customer' : 'Add customer'}</Button>
            {editingCustomerId && <Button variant="outline-accent" onPress={() => { setEditingCustomerId(null); setCustomerForm(EMPTY_CUSTOMER); }}>Cancel editing</Button>}
          </View>

          <FollowUpCard navigation={navigation} limit={3} />

          <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Customer list</Text>
          {state.customers.length ? state.customers.map((customer) => {
            const stats = customerStats(customer, state.upcomingWork, state.services);
            return (
              <View style={styles.row} key={customer.id}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>{customer.name}</Text>
                  <Text style={styles.rowMeta}>{customer.phone || customer.email || 'No contact details'}</Text>
                  <Text style={styles.rowMeta}>
                    {stats.visits} visit{stats.visits === 1 ? '' : 's'} · R{stats.totalSpent.toFixed(0)} spent
                    {stats.lastVisitDate ? ` · last on ${stats.lastVisitDate}` : ''}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => followUp(customer)} accessibilityLabel={`Message ${customer.name}`}><Text style={styles.actionText}>Message</Text></Pressable>
                  <Pressable onPress={() => editCustomer(customer)}><Text style={styles.actionText}>Edit</Text></Pressable>
                  <Pressable onPress={() => setConfirm({ kind: 'customer', id: customer.id, name: customer.name })}><Text style={styles.deleteText}>Delete</Text></Pressable>
                </View>
              </View>
            );
          }) : <Text style={styles.empty}>No customers yet.</Text>}
        </>
      ) : (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingWorkId ? 'Edit upcoming work' : 'Schedule work'}</Text>
            <Input label="Work title" placeholder="e.g. Taper fade" value={workForm.title} onChangeText={setWork('title')} error={errors.title} />
            <Select label="Service" placeholder="Select a service" options={state.services.map((service) => service.name)} value={workForm.service} onChange={setWork('service')} />
            <Select label="Customer" placeholder="Assign a customer" options={state.customers.map((customer) => customer.name)} value={customerName(workForm.customerId) || ''} onChange={(name) => setWork('customerId')(state.customers.find((customer) => customer.name === name)?.id || '')} />
            <DateField label="Date" value={workForm.date} onChange={setWork('date')} error={errors.date} />
            <TimeField label="Time" value={workForm.time} onChange={setWork('time')} error={errors.time} />
            <Select label="Status" options={WORK_STATUSES} value={workForm.status} onChange={setWork('status')} />
            <Button onPress={saveWork} loading={saving}>{editingWorkId ? 'Save work' : 'Schedule work'}</Button>
            {editingWorkId && <Button variant="outline-accent" onPress={() => { setEditingWorkId(null); setWorkForm(EMPTY_WORK); setErrors({}); }}>Cancel editing</Button>}
          </View>

          <Text style={styles.sectionTitle}>Upcoming work{upcoming.length ? ` (${upcoming.length})` : ''}</Text>
          {upcoming.length ? upcoming.map((work) => renderWork(work, true)) : <Text style={styles.empty}>No upcoming work scheduled.</Text>}

          {past.length ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Past & completed ({past.length})</Text>
              {past.map((work) => renderWork(work, false))}
            </>
          ) : null}
        </>
      )}

      <FollowUpSheet
        visible={Boolean(message)}
        customer={message?.customer}
        message={message?.text}
        title={message?.title}
        onClose={() => setMessage(null)}
        onSent={(customer) => markContacted(customer.id)}
      />

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={confirm?.kind === 'customer' ? 'Delete customer' : 'Delete appointment'}
        message={
          confirm?.kind === 'customer'
            ? `Delete ${confirm?.name}? Their appointments stay, but will no longer be linked to them. This cannot be undone.`
            : `Delete "${confirm?.name || 'this appointment'}"? This cannot be undone.`
        }
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
      />
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
  banner: { borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14 },
  bannerSuccess: { backgroundColor: colors.successBg },
  bannerError: { backgroundColor: colors.dangerBg },
  bannerText: { fontSize: 13, fontWeight: '600' },
  form: { padding: 14, backgroundColor: colors.inputBg, borderRadius: radius.md, marginBottom: 22 },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowInfo: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  status: { fontSize: 11.5, fontWeight: '700' },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
