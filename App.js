import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { AssistantProvider } from './src/context/AssistantContext';
import { I18nProvider } from './src/i18n/I18nContext';
import { RemindersProvider } from './src/context/RemindersContext';
import RootNavigator from './src/navigation/RootNavigator';
import { installInterText, useInterFonts } from './src/lib/fonts';

// The designer's typeface (Inter) is applied to every <Text> / <TextInput> once, here.
installInterText();

export default function App() {
  // Show the app straight away even if the font is slow or fails to load (the system font is used meanwhile).
  useInterFonts();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <I18nProvider>
          <RemindersProvider>
            <AssistantProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </AssistantProvider>
          </RemindersProvider>
        </I18nProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
