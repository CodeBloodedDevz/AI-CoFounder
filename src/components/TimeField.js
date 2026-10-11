import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import PickerField from './PickerField';
import { colors, radius } from '../theme';
import { normalizeTime, timeSlots } from '../lib/schedule';

const SLOTS = timeSlots(6, 21, 30);

// Tap the box, pick a time slot (or type your own, e.g. "2pm"). Optional.
export default function TimeField({ label = 'Time', value, onChange, placeholder = 'Select a time (optional)', error }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState('');

  const pick = (time) => {
    onChange(time);
    setOpen(false);
  };

  const useTyped = () => {
    const t = normalizeTime(typed);
    if (t === null) return setTypedError('Try a time like 14:30 or 2pm.');
    setTypedError('');
    setTyped('');
    pick(t);
  };

  return (
    <>
      <PickerField label={label} icon="time-outline" value={value} placeholder={placeholder} onPress={() => setOpen(true)} error={error} />
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <Pressable style={[styles.none, !value && styles.slotActive]} onPress={() => pick('')}>
          <Text style={[styles.slotText, !value && styles.slotTextActive]}>No specific time</Text>
        </Pressable>

        <View style={styles.grid}>
          {SLOTS.map((slot) => (
            <Pressable
              key={slot}
              style={[styles.slot, value === slot && styles.slotActive]}
              onPress={() => pick(slot)}
              accessibilityRole="button"
              accessibilityState={{ selected: value === slot }}
            >
              <Text style={[styles.slotText, value === slot && styles.slotTextActive]}>{slot}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.orLabel}>Or type a time</Text>
        <View style={styles.typedRow}>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              setTypedError('');
            }}
            onSubmitEditing={useTyped}
            placeholder="e.g. 14:30 or 2pm"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
          />
          <Pressable style={[styles.useBtn, !typed.trim() && { opacity: 0.4 }]} onPress={useTyped} disabled={!typed.trim()}>
            <Text style={styles.useText}>Use</Text>
          </Pressable>
        </View>
        {typedError ? <Text style={styles.error}>{typedError}</Text> : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  none: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '22.5%', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center' },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { fontSize: 13, fontWeight: '600', color: colors.text },
  slotTextActive: { color: colors.white },
  orLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 6 },
  typedRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, color: colors.text },
  useBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 20 },
  useText: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
  error: { fontSize: 12, color: colors.danger, marginTop: 6 },
});
