import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function ChatBubble({ from = 'ai', children }) {
  const isAi = from === 'ai';
  return (
    <View style={[styles.row, { justifyContent: isAi ? 'flex-start' : 'flex-end' }]}>
      <View style={[styles.bubble, isAi ? styles.aiBubble : styles.userBubble]}>
        <Text style={[styles.text, { color: isAi ? colors.white : colors.text }]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 10 },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  aiBubble: { backgroundColor: colors.dark, borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: colors.inputBg, borderBottomRightRadius: 4 },
  text: { fontSize: 13.5, lineHeight: 19 },
});
