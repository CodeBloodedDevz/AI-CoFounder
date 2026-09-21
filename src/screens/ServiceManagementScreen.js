import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Select from '../components/Select';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { colors, radius } from '../theme';
import BackButton from '../components/BackButton';

const EMPTY_FORM = { name: '', price: '', duration: '', category: '' };

export default function ServiceManagementScreen({ navigation }) {
  const { state, addService, updateService, deleteService } = useApp();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const service = {
      name: form.name.trim(),
      price: Number(form.price || 0),
      duration: form.duration.trim(),
      category: form.category.trim() || 'General',
    };
    if (!service.name || !service.price || !service.duration) return;

    if (editingId) updateService(editingId, service);
    else addService(service);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const edit = (service) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      price: String(service.price),
      duration: service.duration,
      category: service.category,
    });
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>Services</Text>
        <Text style={styles.subtitle}>Manage the services your business provides.</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>{editingId ? 'Edit service' : 'Add a service'}</Text>
        <Input label="Service name" placeholder="e.g. Consultation" value={form.name} onChangeText={set('name')} />
        <Input label="Price" keyboardType="decimal-pad" placeholder="R450" value={form.price} onChangeText={set('price')} />
        <Input label="Duration" placeholder="e.g. 60 minutes" value={form.duration} onChangeText={set('duration')} />
        <Input label="Category" placeholder="e.g. Consultations" value={form.category} onChangeText={set('category')} />
        <Button onPress={save} disabled={!form.name || !form.price || !form.duration}>
          {editingId ? 'Save changes' : 'Add service'}
        </Button>
        {editingId && (
          <Button variant="outline-accent" onPress={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
            Cancel editing
          </Button>
        )}
      </View>

      <Text style={styles.sectionTitle}>Your services</Text>
      {state.services.length ? state.services.map((service) => (
        <View style={styles.serviceRow} key={service.id}>
          <View style={styles.serviceInfo}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.serviceMeta}>{service.category} · {service.duration}</Text>
          </View>
          <View style={styles.actions}>
            <Text style={styles.price}>R{Number(service.price).toFixed(0)}</Text>
            <Pressable onPress={() => edit(service)}><Text style={styles.actionText}>Edit</Text></Pressable>
            <Pressable onPress={() => deleteService(service.id)}><Text style={styles.deleteText}>Delete</Text></Pressable>
          </View>
        </View>
      )) : <Text style={styles.empty}>No services yet. Add your first service above.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  form: { padding: 14, backgroundColor: colors.inputBg, borderRadius: radius.md, marginBottom: 22 },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  serviceInfo: { flex: 1, paddingRight: 8 },
  serviceName: { fontSize: 14, fontWeight: '700', color: colors.text },
  serviceMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  actions: { alignItems: 'flex-end', gap: 5 },
  price: { fontSize: 14, fontWeight: '800', color: colors.primary },
  actionText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
