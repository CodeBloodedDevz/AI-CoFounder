import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useTranslation } from '../i18n/I18nContext';
import { PRESET_REMINDERS, MAX_REMINDERS_PER_BOOKING, normalizeReminders, parseReminder, reminderLabel, reminderTime } from '../lib/reminders';
import { colors, radius } from '../theme';

// Chooses when to be reminded about a booking: on the day, 1 / 2 / 3 days before, or a custom number of days
// or hours before; several at once; or none. Shows exactly when each reminder will arrive.
//   value: ['d1', 'h2', ...]   onChange(codes)   work: { date, time } (to show the times)
/** "Mon 19 Oct 08:00" for a reminder time. */
export function formatReminderMoment(at, formatDate) {
  const two = (n) => String(n).padStart(2, '0');
  const iso = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `${formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

export default function ReminderPicker({ value, onChange, work }) {
  const { t, formatDate } = useTranslation();
  const codes = normalizeReminders(value);
  const off = codes.length === 0;
  const [customOpen, setCustomOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('d');
  const [error, setError] = useState('');

  const toggle = (code) => {
    setError('');
    if (codes.includes(code)) return onChange(codes.filter((c) => c !== code));
    if (codes.length >= MAX_REMINDERS_PER_BOOKING) return setError(t('reminders.errMax', { count: MAX_REMINDERS_PER_BOOKING }));
    onChange(normalizeReminders([...codes, code]));
  };
  const addCustom = () => {
    const n = Number(String(amount).trim());
    const code = `${unit}${n}`;
    if (!Number.isInteger(n) || !parseReminder(code)) return setError(unit === 'd' ? t('reminders.errDays') : t('reminders.errHours'));
    if (codes.includes(code)) return setError(t('reminders.errSame'));
    if (codes.length >= MAX_REMINDERS_PER_BOOKING) return setError(t('reminders.errMax', { count: MAX_REMINDERS_PER_BOOKING }));
    setError('');
    setAmount('');
    setCustomOpen(false);
    onChange(normalizeReminders([...codes, code]));
  };

  const customs = codes.filter((c) => !PRESET_REMINDERS.includes(c));
  const now = new Date();
  const times = work?.date ? codes.map((c) => ({ code: c, at: reminderTime(work, c) })).filter((x) => x.at) : [];

  const Chip = ({ active, label, onPress, icon, a11y }) => (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipOutline]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11y || label}
    >
      {icon ? <Icon name={icon} size={13} color={active ? colors.white : colors.textSoft} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('reminders.title')}</Text>
      <View style={styles.chips}>
        {PRESET_REMINDERS.map((c) => (
          <Chip key={c} active={codes.includes(c)} label={reminderLabel(c, t)} onPress={() => toggle(c)} />
        ))}
        {customs.map((c) => (
          <Chip key={c} active label={`${reminderLabel(c, t)}  ✕`} a11y={t('reminders.remove', { what: reminderLabel(c, t) })} onPress={() => toggle(c)} />
        ))}
        <Chip active={false} icon="add" label={t('reminders.custom')} onPress={() => setCustomOpen((o) => !o)} />
        <Chip active={off} icon="notifications-off-outline" label={t('reminders.none')} onPress={() => { setError(''); onChange([]); }} />
      </View>

      {customOpen ? (
        <View style={styles.customRow}>
          <TextInput
            style={styles.amount}
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^\d]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder={unit === 'd' ? '7' : '2'}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('reminders.howMany')}
            onSubmitEditing={addCustom}
          />
          {['d', 'h'].map((u) => (
            <Chip key={u} active={unit === u} label={u === 'd' ? t('reminders.daysBeforeUnit') : t('reminders.hoursBeforeUnit')} onPress={() => setUnit(u)} />
          ))}
          <Pressable onPress={addCustom} style={styles.add} accessibilityRole="button">
            <Text style={styles.addText}>{t('reminders.add')}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.summary}>
        {off
          ? t('reminders.offSummary')
          : !work?.date
          ? t('reminders.pickDateSummary')
          : times
              .map(({ code, at }) =>
                at <= now
                  ? t('reminders.alreadyPassed', { what: reminderLabel(code, t) })
                  : formatReminderMoment(at, formatDate)
              )
              .join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill },
  chipOutline: { borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  customRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  amount: { width: 56, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, color: colors.text, textAlign: 'center' },
  add: { paddingHorizontal: 12, paddingVertical: 7 },
  addText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  error: { fontSize: 12, color: colors.danger, marginTop: 6 },
  summary: { fontSize: 12, color: colors.textMuted, marginTop: 8, lineHeight: 17 },
});
