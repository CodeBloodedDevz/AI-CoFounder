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
  const hasBusiness = !!state.business;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : !hasBusiness ? (
          <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
            <Stack.Screen name="BusinessAnalytics" component={BusinessAnalyticsScreen} />
            <Stack.Screen name="PricingAssistant" component={PricingAssistantScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
