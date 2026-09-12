import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import RecordTransactionScreen from '../screens/RecordTransactionScreen';
import AIChatScreen from '../screens/AIChatScreen';
import StockManagementScreen from '../screens/StockManagementScreen';
import MoreScreen from '../screens/MoreScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{icon}</Text>;
}

export default function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: t('navHome'), tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }}
      />
      <Tab.Screen
        name="RecordTransaction"
        component={RecordTransactionScreen}
        options={{ title: t('navTransactions'), tabBarIcon: ({ focused }) => <TabIcon icon="🧾" focused={focused} /> }}
        initialParams={{}}
      />
      <Tab.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{ title: t('navAI'), tabBarIcon: ({ focused }) => <TabIcon icon="✨" focused={focused} /> }}
      />
      <Tab.Screen
        name="StockManagement"
        component={StockManagementScreen}
        options={{ title: t('navStock'), tabBarIcon: ({ focused }) => <TabIcon icon="📦" focused={focused} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: t('navMore'), tabBarIcon: ({ focused }) => <TabIcon icon="⋯" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
