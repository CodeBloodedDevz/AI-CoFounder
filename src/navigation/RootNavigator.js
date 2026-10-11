import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import BusinessSetupScreen from '../screens/BusinessSetupScreen';
import BusinessAnalyticsScreen from '../screens/BusinessAnalyticsScreen';
import PricingAssistantScreen from '../screens/PricingAssistantScreen';
import OperationsScreen from '../screens/OperationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import RecordTransactionScreen from '../screens/RecordTransactionScreen';
import VoiceNotesScreen from '../screens/VoiceNotesScreen';
import MainTabs from './MainTabs';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { state, isReady } = useApp();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isLoggedIn = !!state.user;
  const initialRouteName = !isLoggedIn ? 'Login' : state.business ? 'Main' : 'BusinessSetup';
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Splash" component={SplashScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
            <Stack.Screen name="BusinessAnalytics" component={BusinessAnalyticsScreen} />
            <Stack.Screen name="PricingAssistant" component={PricingAssistantScreen} />
            <Stack.Screen name="Operations" component={OperationsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />
            <Stack.Screen name="RecordTransaction" component={RecordTransactionScreen} />
            <Stack.Screen name="VoiceNotes" component={VoiceNotesScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
