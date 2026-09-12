import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, shadow } from '../theme';

export default function LocationInput({ label, value, onChange, placeholder, icon = '📍' }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => setQuery(value || ''), [value]);

  const search = (text) => {
    clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&countrycodes=za&q=${encodeURIComponent(
            text
          )}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const handleChange = (text) => {
    setQuery(text);
    onChange(text);
    search(text);
  };

  const handleSelect = (item) => {
    setQuery(item.display_name);
    onChange(item.display_name);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.wrap}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChange}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      {open && suggestions.length > 0 && (
        <View style={styles.suggestions}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => String(item.place_id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.suggestionRow} onPress={() => handleSelect(item)}>
                <Text style={styles.suggestionText} numberOfLines={2}>
                  📍 {item.display_name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  icon: { fontSize: 16, marginRight: 6 },
  input: { flex: 1, paddingVertical: 13, fontSize: 14.5, color: colors.text },
  suggestions: {
    marginTop: 6,
    maxHeight: 200,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  suggestionRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 13, color: colors.textSoft },
});
