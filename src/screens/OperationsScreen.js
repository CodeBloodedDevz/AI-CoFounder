import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Icon from '../components/Icon';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import DateField from '../components/DateField';
import TimeField from '../components/TimeField';
import WorkRow, { BookingBadge } from '../components/WorkRow';
import CustomerHistorySheet from '../components/CustomerHistorySheet';
import Banner from '../components/Banner';
import EmptyState from '../components/EmptyState';
import BottomSheet from '../components/BottomSheet';
import ReminderPicker, { formatReminderMoment } from '../components/ReminderPicker';
import { useReminders } from '../context/RemindersContext';
import { DEFAULT_REMINDERS, normalizeReminders, reminderLabel, reminderStatus, reminderTime } from '../lib/reminders';
import { openAppSettings, canOpenSettings } from '../lib/permissions';
import FollowUpCard from '../components/FollowUpCard';
import FollowUpSheet from '../components/FollowUpSheet';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useContactLog } from '../hooks/useContactLog';
import { colors, radius, type } from '../theme';
import BackButton from '../components/BackButton';
import ScreenHeader from '../components/ScreenHeader';
import { followUpMessage, validateWork, todayISO, dayLabel, addDays } from '../lib/schedule';
import {
  OPEN_STATUSES,
  bookingState,
  canComplete,
  canMarkMissed,
  customerHistory,
  findDuplicateBooking,
  formStatusOptions,
  isCancelled,
  isCompleted,
  isMissed,
  isOpen,
  splitBookings,
} from '../lib/bookings';
import { isEmail, parseAmount } from '../lib/numbers';
import { normalizePhone } from '../lib/schedule';

import { useTranslation } from '../i18n/I18nContext';

const PAST_PAGE = 10;

const EMPTY_CUSTOMER = { name: '', phone: '', email: '' };
const EMPTY_WORK = { title: '', service: '', customerId: '', date: '', time: '', status: 'Pending', notes: '', price: '', reminders: DEFAULT_REMINDERS };

// mode="upcoming" is the dedicated Upcoming Work page (Home -> Upcoming work -> See more): the full list of
// upcoming bookings with the same actions, reminders and details as here, without the forms. Editing or
// rescheduling from that page opens this screen's booking form (see editWorkId below).
export default function OperationsScreen({ navigation, route, mode }) {
  const upcomingPage = mode === 'upcoming';
  const { t, formatMoney, tv, currencySymbol, formatDate } = useTranslation();
  const reminders = useReminders();
  const [askNotifications, setAskNotifications] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const { state, addCustomer, updateCustomer, deleteCustomer, addUpcomingWork, updateUpcomingWork, deleteUpcomingWork , reloadData } = useApp();
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
  const scrollRef = useRef(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [pastShown, setPastShown] = useState(PAST_PAGE);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyFor, setHistoryFor] = useState(null); // customer whose appointment history is open
  const [busyId, setBusyId] = useState(null); // booking whose status is being saved (stops double taps)
  const toTop = () => scrollRef.current?.scrollTo?.({ y: 0, animated: true });

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

  const setCustomer = (key) => (value) => {
    setCustomerForm((current) => ({ ...current, [key]: value }));
    const errKey = key === 'name' ? 'customerName' : key === 'email' ? 'customerEmail' : key === 'phone' ? 'customerPhone' : null;
    if (errKey) setErrors((e) => ({ ...e, [errKey]: undefined }));
  };
  const setWork = (key) => (value) => {
    setWorkForm((current) => {
      const next = { ...current, [key]: value };
      // Picking a service fills in its price, unless a different price was typed for this booking.
      if (key === 'service') {
        const oldPrice = state.services.find((sv) => sv.name === current.service)?.price;
        const newPrice = state.services.find((sv) => sv.name === value)?.price;
        if (!current.price || parseAmount(current.price) === Number(oldPrice)) next.price = newPrice != null ? String(newPrice) : current.price;
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const visibleCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    return [...state.customers]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) || String(c.email || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.customers, customerQuery]);
  const detailsWork = detailsId ? state.upcomingWork.find((w) => w.id === detailsId) : null;
  // Opened by tapping a reminder notification: show that booking.
  const openedBooking = route?.params?.bookingId;
  const openedAt = route?.params?.openedAt;
  useEffect(() => {
    if (!openedBooking) return;
    setView('work');
    if (state.upcomingWork.some((w) => w.id === openedBooking)) setDetailsId(openedBooking);
    else show('error', t('reminders.bookingGone'));
  }, [openedBooking, openedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookings = useMemo(() => splitBookings(state.upcomingWork, new Date(), state.services), [state.upcomingWork, state.services]);
  const { upcoming } = bookings;

  /* ---------- customers ---------- */

  const saveCustomer = async () => {
    if (saving) return;
    const value = { name: customerForm.name.replace(/\s+/g, ' ').trim(), phone: customerForm.phone.trim(), email: customerForm.email.trim() };
    const nextErrors = {};
    if (!value.name) nextErrors.customerName = t('customers.errName');
    if (value.email && !isEmail(value.email)) nextErrors.customerEmail = t('customers.errEmail');
    if (value.phone && !normalizePhone(value.phone)) nextErrors.customerPhone = t('customers.errPhone');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return show('error', t('operations.fixFields'));
    setSaving(true);
    const result = editingCustomerId ? await updateCustomer(editingCustomerId, value) : await addCustomer(value);
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || t('operations.couldntSaveCustomer'));
    show('success', editingCustomerId ? t('operations.customerUpdated') : t('operations.customerAdded'));
    setCustomerForm(EMPTY_CUSTOMER);
    setEditingCustomerId(null);
  };

  const editCustomer = (customer) => {
    setBanner(null);
    setEditingCustomerId(customer.id);
    setErrors({});
    setCustomerForm({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
    toTop();
  };

  /* ---------- appointments ---------- */

  const editing = editingWorkId ? state.upcomingWork.find((w) => w.id === editingWorkId) : null;
  const statusChoices = editing
    ? isOpen(editing)
      ? OPEN_STATUSES
      : null // completed / missed / cancelled: the outcome is changed with the row's buttons
    : formStatusOptions(workForm.date);

  // Keep the chosen status valid for the chosen date (a past date can only be a completed visit).
  useEffect(() => {
    if (statusChoices && !statusChoices.includes(workForm.status)) setWorkForm((f) => ({ ...f, status: statusChoices[0] }));
  }, [workForm.date, editingWorkId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWork = async () => {
    if (saving) return;
    // A service alone is enough of a title ("Haircut").
    const form = { ...workForm, title: workForm.title.trim() || workForm.service };
    const checked = validateWork(form);
    const errs = { ...checked.errors };
    if (!form.customerId) errs.customerId = t('booking.errCustomer');
    else if (!state.customers.some((c) => c.id === form.customerId)) errs.customerId = t('booking.errCustomerGone');
    const today = todayISO();
    const moved = editing && (form.date !== editing.date || (checked.value?.time || '') !== (editing.time || ''));
    if (checked.ok) {
      const status = statusChoices ? form.status : editing.status;
      if (!editing && OPEN_STATUSES.includes(status) && form.date < today) errs.date = t('booking.errPastDate');
      if (status === 'Completed' && form.date > today) errs.date = t('booking.errFutureComplete');
      if (editing && moved && !isCompleted(editing) && form.date < today) errs.date = t('booking.errRescheduleDate');
      if (editing && isCompleted(editing) && form.date > today) errs.date = t('booking.errFutureComplete');
      const dup = findDuplicateBooking(state.upcomingWork, { ...checked.value, customerId: form.customerId }, editingWorkId);
      if (dup && ['Pending', 'Confirmed', 'Completed'].includes(status)) {
        errs.date = t('booking.errDuplicate', { when: `${dayLabel(dup.date)}${dup.time ? ` ${t('schedule.atTime', { time: dup.time })}` : ''}` });
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return show('error', t('operations.fixFields'));

    const price = form.price === '' ? null : parseAmount(form.price);
    if (form.price !== '' && (price === null || price < 0)) {
      setErrors({ ...errs, price: t('booking.errPrice') });
      return show('error', t('operations.fixFields'));
    }
    const value = { title: checked.value.title, service: form.service || '', customerId: form.customerId, date: checked.value.date, time: checked.value.time, notes: form.notes.trim(), price };
    if (!editing || isOpen(editing)) value.reminders = normalizeReminders(form.reminders);
    if (statusChoices) value.status = form.status;
    setSaving(true);
    const result = editingWorkId ? await updateUpcomingWork(editingWorkId, value) : await addUpcomingWork(value);
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || t('operations.couldntSaveAppointment'));

    show('success', editingWorkId ? (moved && !isCompleted(editing) ? t('booking.rescheduled') : t('operations.appointmentUpdated')) : t('operations.appointmentScheduled'));
    // First booking with reminders on this phone: explain, then ask for notification permission.
    if (value.reminders?.length && reminders.supported && reminders.permission === 'undetermined') setAskNotifications(true);
    setWorkForm(EMPTY_WORK);
    setEditingWorkId(null);
    setErrors({});
  };

  const editWork = (work) => {
    if (upcomingPage) {
      // The booking form lives on Customers & work: open it there, filled in. Back returns to this list.
      setDetailsId(null);
      navigation.navigate('Operations', { view: 'work', editWorkId: work.id, openedAt: Date.now() });
      return;
    }
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
      notes: work.notes || '',
      price: work.price != null ? String(work.price) : '',
      reminders: Array.isArray(work.reminders) ? work.reminders : [],
    });
    setDetailsId(null);
    toTop();
  };

  // Opened with a booking to change (from the Upcoming Work page).
  const editWorkId = route?.params?.editWorkId;
  useEffect(() => {
    if (upcomingPage || !editWorkId) return;
    const work = state.upcomingWork.find((w) => w.id === editWorkId);
    setView('work');
    if (work) editWork(work);
    else show('error', t('reminders.bookingGone'));
  }, [editWorkId, openedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookFor = (customer) => {
    setHistoryFor(null);
    setView('work');
    setEditingWorkId(null);
    setErrors({});
    setBanner(null);
    setWorkForm({ ...EMPTY_WORK, customerId: customer.id });
    toTop();
  };

  // Records an outcome / status change. The server re-checks every rule, so a stale screen can't
  // complete a booking twice or mark a future booking as missed.
  const setStatus = async (work, status, successKey) => {
    if (busyId) return;
    setBusyId(work.id);
    const result = await updateUpcomingWork(work.id, { status });
    setBusyId(null);
    if (!result?.ok) return show('error', result?.error || t('operations.couldntUpdateAppointment'));
    const name = work.title || work.service || t('workRow.appointment');
    const inc = result.income;
    if (status === 'Completed' && inc?.transaction) {
      return show('success', t('booking.incomeRecorded', { name, amount: formatMoney(Number(inc.transaction.amount)) }));
    }
    if (status === 'Completed' && inc?.skipped === 'no_price') return show('error', t('booking.incomeNoPrice', { name }));
    if (status === 'Completed' && inc?.skipped === 'migration_needed') return show('error', t('booking.incomeNeedsUpdate', { name }));
    if (inc?.removed?.length) return show('success', t('booking.incomeRemoved', { name }));
    show('success', t(successKey, { name }));
  };

  const askStatus = (work, kind) => setConfirm({ kind, id: work.id, name: work.title || work.service, work });

  const restore = (work) => {
    // A cancelled booking whose day has passed needs a new date: open it in the form to reschedule.
    if (work.date < todayISO()) {
      editWork(work);
      return show('error', t('booking.pickNewDate'));
    }
    return setStatus(work, 'Pending', 'booking.restored');
  };

  const remind = (work) => {
    const customer = state.customers.find((c) => c.id === work.customerId);
    if (!customer) return;
    setMessage({
      customer,
      title: t('operations.sendReminder'),
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
      title: t('operations.sendFollowUp'),
      text: followUpMessage({ kind: 'followup', customerName: customer.name, businessName: state.business?.name, service: last?.service }),
    });
  };

  const CONFIRM_STATUS = {
    missed: ['No-show', 'booking.markedMissed'],
    cancel: ['Cancelled', 'booking.cancelled'],
    undo: ['Pending', 'booking.completionUndone'],
    correct: ['Completed', 'operations.markedCompleted'],
  };

  const confirmAction = async () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    if (CONFIRM_STATUS[target.kind]) {
      const [status, key] = CONFIRM_STATUS[target.kind];
      return setStatus(target.work, status, key);
    }
    if (target.kind === 'work') {
      const result = await deleteUpcomingWork(target.id);
      if (!result?.ok) show('error', result?.error || t('operations.couldntDeleteAppointment'));
      else {
        if (editingWorkId === target.id) {
          setEditingWorkId(null);
          setWorkForm(EMPTY_WORK);
        }
        show('success', t('operations.appointmentDeleted'));
      }
    } else {
      const result = await deleteCustomer(target.id);
      if (!result?.ok) show('error', result?.error || t('sync.couldnTDeleteTheCustomer'));
      else {
        if (editingCustomerId === target.id) {
          setEditingCustomerId(null);
          setCustomerForm(EMPTY_CUSTOMER);
        }
        show('success', t('customers.deleted', { name: target.name }));
      }
    }
  };

  const Action = ({ label, onPress, danger }) => (
    <Pressable onPress={onPress} disabled={Boolean(busyId)} hitSlop={6} accessibilityRole="button" style={styles.action}>
      <Text style={danger ? styles.deleteText : styles.actionText}>{label}</Text>
    </Pressable>
  );

  // One line under a booking saying what its reminders will do on this device.
  const reminderLine = (work) => {
    const st = reminderStatus(work);
    if (st.state === 'notNeeded') return null;
    if (st.state === 'off') return { icon: 'notifications-off-outline', color: colors.textMuted, text: t('reminders.lineOff') };
    if (st.state === 'passed') return { icon: 'notifications-outline', color: colors.textMuted, text: t('reminders.linePassed') };
    if (!reminders.supported) return { icon: 'notifications-outline', color: colors.textMuted, text: t('reminders.lineWeb', { when: formatReminderMoment(st.next, formatDate) }) };
    if (reminders.permission !== 'granted') return { icon: 'alert-circle-outline', color: colors.warning, text: t('reminders.lineBlocked') };
    return { icon: 'notifications-outline', color: colors.primaryDark, text: t('reminders.lineNext', { when: formatReminderMoment(st.next, formatDate) }) };
  };

  const renderWork = (work) => {
    const st = bookingState(work, new Date(), state.services);
    const customer = state.customers.find((c) => c.id === work.customerId);
    const actions = [];
    if (isOpen(work)) {
      if (canComplete(work)) actions.push(<Action key="done" label={t('booking.complete')} onPress={() => setStatus(work, 'Completed', 'operations.markedCompleted')} />);
      if (canMarkMissed(work)) actions.push(<Action key="missed" label={t('booking.markMissed')} onPress={() => askStatus(work, 'missed')} danger />);
      if (work.status === 'Pending' && st !== 'awaiting') actions.push(<Action key="conf" label={t('booking.confirm')} onPress={() => setStatus(work, 'Confirmed', 'booking.confirmedMsg')} />);
      actions.push(<Action key="edit" label={t('booking.reschedule')} onPress={() => editWork(work)} />);
      if (st !== 'awaiting' && customer?.phone) actions.push(<Action key="remind" label={t('operations.remind')} onPress={() => remind(work)} />);
      actions.push(<Action key="cancel" label={t('booking.cancel')} onPress={() => askStatus(work, 'cancel')} danger />);
    } else if (isCompleted(work)) {
      actions.push(<Action key="edit" label={t('common.edit')} onPress={() => editWork(work)} />);
      actions.push(<Action key="undo" label={t('booking.undoComplete')} onPress={() => askStatus(work, 'undo')} />);
    } else if (isMissed(work)) {
      actions.push(<Action key="resched" label={t('booking.reschedule')} onPress={() => editWork(work)} />);
      actions.push(<Action key="correct" label={t('booking.cameAfterAll')} onPress={() => askStatus(work, 'correct')} />);
      actions.push(<Action key="del" label={t('common.delete')} onPress={() => setConfirm({ kind: 'work', id: work.id, name: work.title || work.service })} danger />);
    } else {
      actions.push(<Action key="restore" label={t('booking.restore')} onPress={() => restore(work)} />);
      actions.push(<Action key="del" label={t('common.delete')} onPress={() => setConfirm({ kind: 'work', id: work.id, name: work.title || work.service })} danger />);
    }
    const rem = reminderLine(work);
    return (
      <Pressable key={work.id} onPress={() => setDetailsId(work.id)} accessibilityRole="button" accessibilityLabel={t('reminders.openDetails', { name: work.title || work.service || '' })}>
        <WorkRow
          work={work}
          customerName={customer?.name}
          right={<BookingBadge work={work} services={state.services} />}
          below={
            <>
              {rem ? (
                <View style={styles.remRow}>
                  <Icon name={rem.icon} size={13} color={rem.color} />
                  <Text style={[styles.remText, { color: rem.color }]} numberOfLines={2}>{rem.text}</Text>
                </View>
              ) : null}
              <View style={styles.actionRow}>{actions}</View>
            </>
          }
        />
      </Pressable>
    );
  };

  const historyList = bookings.history.filter((w) => historyFilter === 'all' || bookingState(w) === historyFilter);
  const historyCounts = {
    all: bookings.history.length,
    completed: bookings.history.filter(isCompleted).length,
    missed: bookings.history.filter(isMissed).length,
    cancelled: bookings.history.filter(isCancelled).length,
  };

  // Shown above the booking lists on both pages.
  const notificationNotice = reminders.supported && reminders.permission !== 'granted' && reminders.permission !== 'undetermined' && state.upcomingWork.some((w) => isOpen(w) && normalizeReminders(w.reminders).length) ? (
    <View style={styles.notifOff}>
      <Icon name="notifications-off-outline" size={16} color={colors.warning} />
      <Text style={styles.notifOffText}>{t('reminders.bannerOff')}</Text>
      {canOpenSettings ? (
        <Pressable onPress={openAppSettings} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.actionText}>{t('voiceErr.openSettings')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : reminders.supported && reminders.permission === 'undetermined' && state.upcomingWork.some((w) => isOpen(w) && normalizeReminders(w.reminders).length) ? (
    <Pressable style={styles.notifOff} onPress={() => setAskNotifications(true)} accessibilityRole="button">
      <Icon name="notifications-outline" size={16} color={colors.primary} />
      <Text style={styles.notifOffText}>{t('reminders.bannerAsk')}</Text>
      <Text style={styles.actionText}>{t('reminders.permAllow')}</Text>
    </Pressable>
  ) : null;
  const needsOutcomeBox = bookings.needsOutcome.length ? (
    <View style={styles.outcomeBox}>
      <Text style={styles.sectionTitle}>{t('booking.needsOutcomeTitle', { count: bookings.needsOutcome.length })}</Text>
      <Text style={styles.sectionHint}>{t('booking.needsOutcomeHint')}</Text>
      {bookings.needsOutcome.map(renderWork)}
    </View>
  ) : null;

  // Dialogs and sheets used by both pages (message, confirmations, booking details, notifications).
  const sheets = (
    <>
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
        title={
          confirm?.kind === 'customer'
            ? t('operations.deleteCustomer')
            : confirm?.kind === 'work'
            ? t('operations.deleteAppointment')
            : t(`booking.confirm.${confirm?.kind}.title`)
        }
        message={
          confirm?.kind === 'customer'
            ? t('operations.confirmDeleteCustomer', { name: confirm?.name })
            : confirm?.kind === 'work'
            ? t('operations.confirmDeleteAppointment', { name: confirm?.name || t('operations.thisAppointment') })
            : t(`booking.confirm.${confirm?.kind}.body`, { name: confirm?.name || t('operations.thisAppointment') })
        }
        tone={confirm?.kind === 'correct' || confirm?.kind === 'undo' ? 'primary' : 'danger'}
        confirmLabel={confirm?.kind && CONFIRM_STATUS[confirm.kind] ? t(`booking.confirm.${confirm.kind}.action`) : undefined}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      />

      <BottomSheet visible={Boolean(detailsWork)} title={t('reminders.detailsTitle')} onClose={() => setDetailsId(null)}>
        {detailsWork ? (
          <View>
            <WorkRow
              work={detailsWork}
              customerName={state.customers.find((c) => c.id === detailsWork.customerId)?.name}
              right={<BookingBadge work={detailsWork} services={state.services} />}
            />
            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>{t('reminders.title')}</Text>
            {(() => {
              const st = reminderStatus(detailsWork);
              const codes = normalizeReminders(detailsWork.reminders);
              if (st.state === 'notNeeded') return <Text style={styles.hint}>{t('reminders.detailNotNeeded')}</Text>;
              if (st.state === 'off') return <Text style={styles.hint}>{t('reminders.detailOff')}</Text>;
              return codes.map((c) => {
                const at = reminderTime(detailsWork, c);
                const past = !at || at <= new Date();
                return (
                  <View key={c} style={styles.remDetail}>
                    <Icon name={past ? 'checkmark-done-outline' : 'notifications-outline'} size={15} color={past ? colors.textMuted : colors.primary} />
                    <Text style={styles.remDetailText}>
                      {reminderLabel(c, t)} · {at ? formatReminderMoment(at, formatDate) : '—'}
                      {past ? ` (${t('reminders.sentOrPassed')})` : ''}
                    </Text>
                  </View>
                );
              });
            })()}
            {isOpen(detailsWork) && reminders.supported && reminders.permission !== 'granted' ? (
              <Text style={[styles.hint, { color: colors.warning, marginTop: 8 }]}>{t('reminders.blockedHint')}</Text>
            ) : null}
            <Button icon="create-outline" onPress={() => editWork(detailsWork)} style={{ marginTop: 14 }}>
              {isOpen(detailsWork) ? t('reminders.changeBooking') : t('common.edit')}
            </Button>
          </View>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        visible={askNotifications}
        tone="primary"
        title={t('reminders.permTitle')}
        message={t('reminders.permBody')}
        confirmLabel={t('reminders.permAllow')}
        cancelLabel={t('reminders.permLater')}
        onConfirm={async () => {
          setAskNotifications(false);
          const r = await reminders.requestPermission();
          if (r.status !== 'granted') show('error', t('reminders.permDenied'));
          else show('success', t('reminders.permGranted'));
        }}
        onCancel={() => setAskNotifications(false)}
      />

      <CustomerHistorySheet customer={historyFor} visible={Boolean(historyFor)} onClose={() => setHistoryFor(null)} onBook={bookFor} />
    </>
  );

  if (upcomingPage) {
    // Upcoming Work page: everything still to come, grouped so the next appointments are easy to find.
    const today = todayISO();
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);
    const groups = [
      { key: 'today', title: t('schedule.today'), items: upcoming.filter((w) => !w.date || w.date <= today) },
      { key: 'tomorrow', title: t('schedule.tomorrow'), items: upcoming.filter((w) => w.date === tomorrow) },
      { key: 'week', title: t('upcomingWork.next7Days'), items: upcoming.filter((w) => w.date > tomorrow && w.date <= weekEnd) },
      { key: 'later', title: t('upcomingWork.later'), items: upcoming.filter((w) => w.date > weekEnd) },
    ].filter((g) => g.items.length);
    const todayCount = upcoming.filter((w) => w.date === today).length;
    const subtitle = upcoming.length
      ? `${t('upcomingWorkSection.comingUp', { count: upcoming.length })}${todayCount ? ` · ${t('upcomingWorkSection.today', { count: todayCount })}` : ''}`
      : t('upcomingWork.subtitleEmpty');
    const scheduleNew = () => navigation.navigate('Operations', { view: 'work' });

    return (
      <Screen scrollRef={scrollRef} onRefresh={reloadData}>
        <ScreenHeader navigation={navigation} title={t('upcomingWorkSection.upcomingWork')} subtitle={subtitle} />
        <Banner type={banner?.type} text={banner?.text} onClose={() => setBanner(null)} />
        <Button variant="outline-accent" size="sm" icon="add-circle-outline" onPress={scheduleNew} style={{ marginBottom: 18 }}>
          {t('operations.scheduleWork')}
        </Button>

        {notificationNotice}
        {needsOutcomeBox}

        {groups.length ? (
          groups.map((g) => (
            <View key={g.key} style={styles.dayGroup}>
              <View style={styles.dayHead}>
                <Text style={styles.dayTitle} accessibilityRole="header">{g.title}</Text>
                <Text style={styles.dayCount}>{g.items.length}</Text>
              </View>
              {g.items.map(renderWork)}
            </View>
          ))
        ) : (
          <EmptyState icon="calendar-outline" title={t('operations.noUpcomingWorkScheduled')} body={t('upcomingWork.emptyBody')} />
        )}
        {sheets}
      </Screen>
    );
  }

  return (
    <Screen scrollRef={scrollRef} onRefresh={reloadData}>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('operations.customersWork')}</Text>
        <Text style={styles.subtitle}>{t('operations.keepCustomerDetailsAndScheduled')}</Text>
      </View>

      <View style={styles.tabs}>
        {['customers', 'work'].map((key) => (
          <Pressable
            key={key}
            onPress={() => { setView(key); setBanner(null); setErrors({}); }}
            style={[styles.tab, view === key && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: view === key }}
          >
            <Text style={[styles.tabText, view === key && styles.tabTextActive]}>
              {key === 'customers' ? t('stockAndServices.customers') : t('operations.upcomingWork')}
              {key === 'customers' && state.customers.length ? ` (${state.customers.length})` : ''}
              {key === 'work' && upcoming.length + bookings.needsOutcome.length ? ` (${upcoming.length + bookings.needsOutcome.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <Banner type={banner?.type} text={banner?.text} onClose={() => setBanner(null)} />

      {view === 'customers' ? (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingCustomerId ? t('operations.editCustomer') : t('operations.addCustomer')}</Text>
            <Input label={t('operations.name')} placeholder={t('common.customerName')} value={customerForm.name} onChangeText={setCustomer('name')} error={errors.customerName} />
            <Input label={t('operations.phone')} keyboardType="phone-pad" placeholder={t('phoneNumber')} value={customerForm.phone} onChangeText={setCustomer('phone')} error={errors.customerPhone} hint={t('customers.phoneHint')} />
            <Input label={t('email')} keyboardType="email-address" autoCapitalize="none" placeholder={t('common.emailAddress')} value={customerForm.email} onChangeText={setCustomer('email')} error={errors.customerEmail} />
            <Button onPress={saveCustomer} loading={saving} disabled={saving}>{editingCustomerId ? t('operations.saveCustomer') : t('operations.addCustomer')}</Button>
            {editingCustomerId && <Button variant="outline-accent" style={{ marginTop: 10 }} onPress={() => { setEditingCustomerId(null); setCustomerForm(EMPTY_CUSTOMER); setErrors({}); }}>{t('common.cancelEditing')}</Button>}
          </View>

          <FollowUpCard navigation={navigation} limit={3} />

          <Text style={[styles.sectionTitle, { marginTop: 22 }]}>{t('operations.customerList')}</Text>
          {state.customers.length > 5 ? (
            <View style={styles.searchWrap}>
              <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={customerQuery}
                onChangeText={setCustomerQuery}
                placeholder={t('customers.search')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('customers.search')}
              />
            </View>
          ) : null}
          {visibleCustomers.length ? visibleCustomers.map((customer) => {
            const h = customerHistory(customer.id, state.upcomingWork, { services: state.services, transactions: state.transactions });
            const counts = [
              t('booking.visitsCount', { count: h.visits }),
              h.upcoming ? t('booking.upcomingCount', { count: h.upcoming }) : null,
              h.missed ? t('booking.missedCount', { count: h.missed }) : null,
              h.cancelled ? t('booking.cancelledCount', { count: h.cancelled }) : null,
            ].filter(Boolean);
            return (
              <View style={styles.row} key={customer.id}>
                <Pressable
                  style={styles.rowInfo}
                  onPress={() => setHistoryFor(customer)}
                  accessibilityRole="button"
                  accessibilityLabel={t('booking.openHistory', { name: customer.name })}
                >
                  <Text style={styles.rowTitle}>{customer.name}</Text>
                  <Text style={styles.rowMeta}>{customer.phone || customer.email || t('operations.noContact')}</Text>
                  <Text style={styles.rowMeta}>
                    {counts.join(' · ')}
                    {h.spent ? ` · ${t('booking.spent', { amount: formatMoney(h.spent, { decimals: 0 }) })}` : ''}
                  </Text>
                  <Text style={styles.rowLink}>
                    {h.nextBooking
                      ? t('booking.nextOn', { date: dayLabel(h.nextBooking.date) })
                      : h.lastVisit
                      ? t('booking.lastVisitOn', { date: dayLabel(h.lastVisit.date) })
                      : t('booking.viewHistory')}
                  </Text>
                </Pressable>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => followUp(customer)} accessibilityLabel={t('operations.messageName', { name: customer.name })}><Text style={styles.actionText}>{t('common.message')}</Text></Pressable>
                  <Pressable onPress={() => editCustomer(customer)}><Text style={styles.actionText}>{t('common.edit')}</Text></Pressable>
                  <Pressable onPress={() => setConfirm({ kind: 'customer', id: customer.id, name: customer.name })}><Text style={styles.deleteText}>{t('common.delete')}</Text></Pressable>
                </View>
              </View>
            );
          }) : state.customers.length ? (
            <EmptyState compact icon="search-outline" title={t('customers.noMatch')} />
          ) : (
            <EmptyState icon="people-outline" title={t('common.noCustomersYet')} body={t('empty.customersBody')} />
          )}
        </>
      ) : (
        <>
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editingWorkId ? t('operations.editUpcomingWork') : t('operations.scheduleWork')}</Text>
            <Input label={t('operations.workTitle')} placeholder={t('operations.eGTaperFade')} value={workForm.title} onChangeText={setWork('title')} error={errors.title} />
            <Select
              label={t('common.service')}
              placeholder={state.services.length ? t('operations.selectAService') : t('operations.noServicesToPick')}
              options={state.services.map((service) => service.name)}
              value={workForm.service}
              onChange={setWork('service')}
            />
            {/* Picked by id, so two customers with the same name can't be mixed up. */}
            <Select
              label={t('operations.customer')}
              placeholder={state.customers.length ? t('operations.assignACustomer') : t('operations.noCustomersToAssign')}
              options={state.customers.map((customer) => customer.id)}
              renderOption={(id) => {
                const c = state.customers.find((x) => x.id === id);
                return c ? (c.phone ? `${c.name} · ${c.phone}` : c.name) : '';
              }}
              value={workForm.customerId}
              onChange={setWork('customerId')}
            />
            {errors.customerId ? <Text style={styles.fieldError}>{errors.customerId}</Text> : null}
            {!state.customers.length ? (
              <Pressable onPress={() => setView('customers')} style={{ marginTop: -8, marginBottom: 14 }} accessibilityRole="button">
                <Text style={styles.actionText}>{t('booking.addCustomerFirst')}</Text>
              </Pressable>
            ) : null}
            <DateField label={t('common.date')} value={workForm.date} onChange={setWork('date')} error={errors.date} />
            <TimeField label={t('operations.time')} value={workForm.time} onChange={setWork('time')} error={errors.time} />
            {editing && !isCompleted(editing) && workForm.date && (workForm.date !== editing.date || (workForm.time || '') !== (editing.time || '')) ? (
              <Text style={styles.hint}>{t('booking.willReschedule', { from: `${dayLabel(editing.date)}${editing.time ? ` ${t('schedule.atTime', { time: editing.time })}` : ''}` })}</Text>
            ) : null}
            {statusChoices ? (
              <Select label={t('operations.status')} options={statusChoices} renderOption={(v) => tv('workStatus', v)} value={workForm.status} onChange={setWork('status')} />
            ) : (
              <Text style={styles.hint}>{t('booking.outcomeLocked', { status: tv('workStatus', editing.status) })}</Text>
            )}
            {statusChoices ? (
              <ReminderPicker value={workForm.reminders} onChange={setWork('reminders')} work={{ date: workForm.date, time: workForm.time }} />
            ) : null}
            {statusChoices && !reminders.supported ? <Text style={styles.hint}>{t('reminders.webHint')}</Text> : null}
            <Input
              label={t('booking.price')}
              placeholder={`${currencySymbol} 0.00`}
              keyboardType="decimal-pad"
              value={workForm.price}
              onChangeText={setWork('price')}
              error={errors.price}
              hint={t('booking.priceHint')}
            />
            <Input label={t('booking.notes')} placeholder={t('booking.notesPlaceholder')} value={workForm.notes} onChangeText={setWork('notes')} maxLength={500} />
            <Button onPress={saveWork} loading={saving} disabled={saving}>{editingWorkId ? t('operations.saveWork') : t('operations.scheduleWork')}</Button>
            {editingWorkId && <Button variant="outline-accent" style={{ marginTop: 10 }} onPress={() => { setEditingWorkId(null); setWorkForm(EMPTY_WORK); setErrors({}); }}>{t('common.cancelEditing')}</Button>}
          </View>

          {notificationNotice}

          {needsOutcomeBox}

          <Text style={styles.sectionTitle}>{t('operations.upcomingWork')}{upcoming.length ? ` (${upcoming.length})` : ''}</Text>
          {upcoming.length ? (
            upcoming.map(renderWork)
          ) : (
            <EmptyState icon="calendar-outline" title={t('operations.noUpcomingWorkScheduled')} body={t('empty.bookingsBody')} />
          )}

          {bookings.history.length ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 22 }]}>{t('booking.historyTitle')}</Text>
              <View style={styles.chips}>
                {['all', 'completed', 'missed', 'cancelled'].filter((key) => key === 'all' || historyCounts[key] > 0 || historyFilter === key).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => { setHistoryFilter(key); setPastShown(PAST_PAGE); }}
                    style={[styles.chip, historyFilter === key ? styles.chipActive : styles.chipOutline]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: historyFilter === key }}
                  >
                    <Text style={[styles.chipText, historyFilter === key && styles.chipTextActive]}>
                      {key === 'all' ? t('all') : t(`booking.state.${key}`)} ({historyCounts[key]})
                    </Text>
                  </Pressable>
                ))}
              </View>
              {historyList.length ? historyList.slice(0, pastShown).map(renderWork) : <EmptyState compact title={t('booking.noneInFilter')} />}
              {historyList.length > pastShown ? (
                <Button variant="outline-accent" size="sm" onPress={() => setPastShown((n) => n + PAST_PAGE)} style={{ marginTop: 12 }}>
                  {t('common.showMore', { count: historyList.length - pastShown })}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {sheets}
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
  banner: { borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14 },
  bannerSuccess: { backgroundColor: colors.successBg },
  bannerError: { backgroundColor: colors.dangerBg },
  bannerText: { fontSize: 13, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  form: { padding: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, marginBottom: 22 },
  formTitle: type.formTitle,
  sectionTitle: type.sectionTitle,
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowInfo: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  status: { fontSize: 11.5, fontWeight: '700' },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  rowLink: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 8 },
  action: { paddingVertical: 2 },
  fieldError: { fontSize: 12, color: colors.danger, marginTop: -10, marginBottom: 12 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: 14, lineHeight: 17 },
  outcomeBox: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: 12, marginBottom: 20 },
  sectionHint: { fontSize: 12.5, color: colors.textSoft, marginTop: -4, marginBottom: 4, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  chipOutline: { borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  remRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  remText: { fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  remDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  remDetailText: { fontSize: 13, color: colors.text, flexShrink: 1 },
  notifOff: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.warningBg, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  notifOffText: { flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 17 },
  dayGroup: { marginBottom: 18 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayTitle: { fontSize: 13, fontWeight: '800', color: colors.primaryDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  dayCount: { fontSize: 12, fontWeight: '700', color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
