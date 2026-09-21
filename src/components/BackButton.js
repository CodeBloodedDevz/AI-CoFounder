import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';
import Icon from './Icon';

export default function BackButton({ navigation }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.button}
      onPress={() => navigation.canGoBack() && navigation.goBack()}
    >
      <Icon name="arrow-back-outline" size={18} color={colors.primary} />
      <Text style={styles.text}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginBottom: 14 },
  text: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
