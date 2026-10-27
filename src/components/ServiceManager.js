import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Input from './Input';
import Button from './Button';
import Banner from './Banner';
import ConfirmDialog from './ConfirmDialog';
import { useBanner } from './useBanner';
import EmptyState from './EmptyState';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { parseAmount } from '../lib/numbers';
import { parseDurationMinutes } from '../lib/aiEngine';
import { colors, radius, type } from '../theme';

const EMPTY = { name: '', price: '', duration: '', category: '' };

// Add / edit / delete the services a business offers. Used by the Services tab (service businesses)
// and the Services part of Stock & Services (hybrid businesses).
//   query       - only list services whose name contains this text
//   onEditStart - called when the person taps Edit (the screen scrolls the form into view)
export default function ServiceManager({ query = '', onEditStart, listTitle }) {
  const { state, addService, updateService, deleteService } = useApp();
  const { t, formatMoney, currencySymbol } = useTranslation();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // service to delete
  const [deleting, setDeleting] = useState(false);
  const { banner, show, clear } = useBanner();

  const services = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...state.services]
      .filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.category || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.services, query]);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setErrors({});
  };

  const save = async () => {
    if (saving) return;
    const name = form.name.replace(/\s+/g, ' ').trim();
    const price = parseAmount(form.price);
    const duration = form.duration.trim();
    const next = {};
    if (!name) next.name = t('services.errName');
    else if (state.services.some((s) => s.id !== editingId && s.name.trim().toLowerCase() === name.toLowerCase())) next.name = t('services.errDuplicate');
    if (price === null || price < 0) next.price = t('services.errPrice');
    if (!duration) next.duration = t('services.errDuration');
    setErrors(next);
    if (Object.keys(next).length) return;

    const service = { name, price, duration, category: form.category.trim() || 'General' };
    setSaving(true);
    const result = editingId ? await updateService(editingId, service) : await addService(service);
    setSaving(false);
    if (!result?.ok) return show('error', result?.error || t('sync.couldnTAddTheService'));
    show('success', editingId ? t('services.updated', { name }) : t('services.added', { name }));
    reset();
  };

  const edit = (service) => {
    clear();
    setErrors({});
    setEditingId(service.id);
    setForm({ name: service.name, price: String(service.price ?? ''), duration: service.duration || '', category: service.category || '' });
    onEditStart?.();
  };

  const remove = async () => {
    const target = confirm;
    setDeleting(true);
    const result = await deleteService(target.id);
    setDeleting(false);
    setConfirm(null);
    if (!result?.ok) return show('error', result?.error || t('sync.couldnTDeleteTheService'));
    if (editingId === target.id) reset();
    show('success', t('services.deleted', { name: target.name }));
  };

  const minutes = form.duration.trim() ? parseDurationMinutes(form.duration) : null;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.formTitle}>{editingId ? t('services.editTitle') : t('services.addTitle')}</Text>
        <Banner type={banner?.type} text={banner?.text} onClose={clear} />
        <Input label={t('common.serviceName')} placeholder={t('serviceManagement.eGConsultation')} value={form.name} onChangeText={set('name')} error={errors.name} />
        <View style={styles.row}>
          <Input
            style={styles.half}
            label={t('common.price')}
            keyboardType="decimal-pad"
            placeholder={`${currencySymbol} 0.00`}
            value={form.price}
            onChangeText={set('price')}
            error={errors.price}
          />
          <Input
            style={styles.half}
            label={t('serviceManagement.duration')}
            placeholder={t('serviceManagement.eG60Minutes')}
            value={form.duration}
            onChangeText={set('duration')}
            error={errors.duration}
            hint={minutes ? t('services.minutes', { count: minutes }) : undefined}
          />
        </View>
        <Input label={t('common.category')} placeholder={t('serviceManagement.eGConsultations')} value={form.category} onChangeText={set('category')} />
        <Button onPress={save} loading={saving} disabled={saving}>
          {editingId ? t('saveChanges') : t('stockAndServices.addService')}
        </Button>
        {editingId ? (
          <Button variant="outline-accent" onPress={reset} style={{ marginTop: 10 }}>
            {t('common.cancelEditing')}
          </Button>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        {listTitle || t('serviceManagement.yourServices')}
        {state.services.length ? ` (${state.services.length})` : ''}
      </Text>
      {services.length ? (
        services.map((service) => (
          <View style={[styles.serviceRow, editingId === service.id && styles.editing]} key={service.id}>
            <View style={styles.info}>
              <Text style={styles.name}>{service.name}</Text>
              <Text style={styles.meta}>{[service.category, service.duration].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={styles.actions}>
              <Text style={styles.price}>{formatMoney(Number(service.price), { decimals: 0 })}</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => edit(service)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('services.editName', { name: service.name })}>
                  <Text style={styles.actionText}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirm(service)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('services.deleteName', { name: service.name })}>
                  <Text style={styles.deleteText}>{t('common.delete')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      ) : (
        state.services.length ? (
          <EmptyState compact icon="search-outline" title={t('services.noMatch')} />
        ) : (
          <EmptyState icon="construct-outline" title={t('serviceManagement.noServicesYetAddYour')} />
        )
      )}

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={t('services.deleteTitle')}
        message={t('services.deleteBody', { name: confirm?.name })}
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, marginBottom: 22 },
  formTitle: type.formTitle,
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  sectionTitle: type.sectionTitle,
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  editing: { backgroundColor: colors.primaryLight, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radius.sm },
  info: { flex: 1, paddingRight: 8 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  actions: { alignItems: 'flex-end', gap: 6 },
  actionRow: { flexDirection: 'row', gap: 14 },
  price: { fontSize: 14, fontWeight: '800', color: colors.primary },
  actionText: { fontSize: 12.5, color: colors.primary, fontWeight: '700' },
  deleteText: { fontSize: 12.5, color: colors.danger, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
