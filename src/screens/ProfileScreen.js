import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Input from '../components/Input';
import Button from '../components/Button';
import BackButton from '../components/BackButton';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { state, updateUserProfile } = useApp();
  const [name, setName] = useState(state.user?.name || '');
  const [contact, setContact] = useState(state.user?.identifier || '');

  const handleSave = () => {
    updateUserProfile({ name: name.trim(), identifier: contact.trim().toLowerCase() });
    navigation.goBack();
  };

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage your personal details</Text>
      </View>

      <Input label="Full name" value={name} onChangeText={setName} placeholder="Your full name" />
      <Input label="Phone or email" value={contact} onChangeText={setContact} placeholder="Your phone or email" autoCapitalize="none" />
      <Button onPress={handleSave} disabled={!name.trim() || !contact.trim()}>Save changes</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
});
