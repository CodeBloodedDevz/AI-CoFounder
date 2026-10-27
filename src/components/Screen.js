import { useCallback, useState } from 'react';
import { ScrollView, View, StyleSheet, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout } from '../theme';
import { useAssistant } from '../context/AssistantContext';

// The page wrapper every screen uses.
//   scroll      - scrolls (default) or a fixed View
//   scrollRef   - lets a screen scroll back to the top (e.g. to show the form it just filled in)
//   onRefresh   - pull down to reload (returns a promise; the spinner shows until it settles)
//   refreshing  - controlled refresh state (optional)
// On tablets / desktop browsers the content is centred and kept to a readable width.

export default function Screen({ children, scroll = true, contentStyle, scrollRef, onRefresh, refreshing }) {
  const Container = scroll ? ScrollView : View;
  // Leave room at the bottom so the floating AI button never sits on top of the last item.
  const { buttonShown, fabClearance } = useAssistant();
  const [pulling, setPulling] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setPulling(true);
    try {
      await onRefresh();
    } finally {
      setPulling(false);
    }
  }, [onRefresh]);

  const room = buttonShown ? [styles.roomForButton, fabClearance ? { paddingBottom: 96 + fabClearance } : null] : null;
  const containerProps = scroll
    ? {
        ref: scrollRef,
        contentContainerStyle: [styles.content, room, contentStyle],
        keyboardShouldPersistTaps: 'handled',
        refreshControl: onRefresh ? (
          <RefreshControl refreshing={Boolean(refreshing ?? pulling)} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        ) : undefined,
      }
    : { style: [styles.content, room, contentStyle] };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Container {...containerProps}>{children}</Container>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  roomForButton: { paddingBottom: 96 },
});
