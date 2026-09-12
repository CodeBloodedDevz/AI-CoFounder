import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { I18nProvider } from './src/i18n/I18nContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <I18nProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </I18nProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
