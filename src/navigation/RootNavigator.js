import { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import RecoveryKeyScreen from '../screens/RecoveryKeyScreen';
import BusinessSetupScreen from '../screens/BusinessSetupScreen';
import BusinessInfoScreen from '../screens/BusinessInfoScreen';
import BusinessAnalyticsScreen from '../screens/BusinessAnalyticsScreen';
import PricingAssistantScreen from '../screens/PricingAssistantScreen';
import OperationsScreen from '../screens/OperationsScreen';
import UpcomingWorkScreen from '../screens/UpcomingWorkScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import RecordTransactionScreen from '../screens/RecordTransactionScreen';
import VoiceNotesScreen from '../screens/VoiceNotesScreen';
import VoiceLanguageScreen from '../screens/VoiceLanguageScreen';
import SponsoredBusinessScreen from '../screens/SponsoredBusinessScreen';
import MyAdsScreen from '../screens/MyAdsScreen';
import AdEditorScreen from '../screens/AdEditorScreen';
import AdDetailScreen from '../screens/AdDetailScreen';
import BusinessPageEditorScreen from '../screens/BusinessPageEditorScreen';
import MainTabs from './MainTabs';
import FloatingAI from '../components/FloatingAI';
import { DataError, DataLoading, SyncToast } from '../components/DataGate';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { state, isReady, dataStatus, dataError, refreshData, logout, recoveryNotice } = useApp();
  const [routeName, setRouteName] = useState(null);
  // The top-level screen ('Main' when the tab bar is showing), not the tab inside it.
  const syncRoute = () => {
    const root = navigationRef.getRootState();
    setRouteName(root ? root.routes[root.index]?.name ?? null : null);
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isLoggedIn = !!state.user;

  // Don't pick a first screen until this person's data has arrived; otherwise a
  // returning user is sent to Business Setup just because the data isn't here yet.
  if (isLoggedIn && (dataStatus === 'idle' || dataStatus === 'loading')) return <DataLoading />;
  if (isLoggedIn && dataStatus === 'error' && !state.business) {
    return <DataError message={dataError} onRetry={refreshData} onLogout={logout} />;
  }

  // A new recovery key (after signing up / resetting the password) is shown before anything else, once.
  if (isLoggedIn && recoveryNotice) return <RecoveryKeyScreen />;

  const initialRouteName = !isLoggedIn ? 'Login' : state.business ? 'Main' : 'BusinessSetup';
  return (
    <NavigationContainer ref={navigationRef} onReady={syncRoute} onStateChange={syncRoute}>
      <View style={{ flex: 1 }}>
      <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="Splash" component={SplashScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
            <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
            <Stack.Screen name="BusinessAnalytics" component={BusinessAnalyticsScreen} />
            <Stack.Screen name="PricingAssistant" component={PricingAssistantScreen} />
            <Stack.Screen name="Operations" component={OperationsScreen} />
            <Stack.Screen name="UpcomingWork" component={UpcomingWorkScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />
            <Stack.Screen name="RecordTransaction" component={RecordTransactionScreen} />
            <Stack.Screen name="VoiceNotes" component={VoiceNotesScreen} />
            <Stack.Screen name="VoiceLanguage" component={VoiceLanguageScreen} />
            <Stack.Screen name="SponsoredBusiness" component={SponsoredBusinessScreen} />
            <Stack.Screen name="MyAds" component={MyAdsScreen} />
            <Stack.Screen name="AdEditor" component={AdEditorScreen} />
            <Stack.Screen name="AdDetail" component={AdDetailScreen} />
            <Stack.Screen name="BusinessPageEditor" component={BusinessPageEditorScreen} />
          </>
        )}
      </Stack.Navigator>
      {/* The AI chat is a floating button above every screen (it used to be a tab). */}
      <FloatingAI routeName={routeName} />
      <SyncToast />
      </View>
    </NavigationContainer>
  );
}
