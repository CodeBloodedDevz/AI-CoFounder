import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import ServiceDashboardScreen from '../screens/ServiceDashboardScreen';
import HybridDashboardScreen from '../screens/HybridDashboardScreen';
import RecordTransactionScreen from '../screens/RecordTransactionScreen';
import AIChatScreen from '../screens/AIChatScreen';
import StockManagementScreen from '../screens/StockManagementScreen';
import ServiceManagementScreen from '../screens/ServiceManagementScreen';
import MoreScreen from '../screens/MoreScreen';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }) {
  return <Icon name={icon} size={21} color={focused ? colors.primary : colors.textMuted} />;
}

export default function MainTabs() {
  const { t } = useTranslation();
  const { state } = useApp();
  const model = state.business?.businessModel || 'Product-based';
  const isService = model === 'Service-based';
  const isHybrid = model === 'Hybrid';
  const Dashboard = isService ? ServiceDashboardScreen : isHybrid ? HybridDashboardScreen : DashboardScreen;

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
        component={Dashboard}
        options={{ title: t('navHome'), tabBarIcon: ({ focused }) => <TabIcon icon="home-outline" focused={focused} /> }}
      />
      <Tab.Screen
        name="RecordTransaction"
        component={RecordTransactionScreen}
        options={{ title: t('navTransactions'), tabBarIcon: ({ focused }) => <TabIcon icon="receipt-outline" focused={focused} /> }}
        initialParams={{}}
      />
      <Tab.Screen
        name="AIChat"
        component={AIChatScreen}
        options={{ title: t('navAI'), tabBarIcon: ({ focused }) => <TabIcon icon="sparkles-outline" focused={focused} /> }}
      />
      {(model === 'Product-based' || isHybrid) && (
        <Tab.Screen
          name="StockManagement"
          component={StockManagementScreen}
          options={{ title: t('navStock'), tabBarIcon: ({ focused }) => <TabIcon icon="cube-outline" focused={focused} /> }}
        />
      )}
      {(isService || isHybrid) && (
        <Tab.Screen
          name="ServiceManagement"
          component={ServiceManagementScreen}
          options={{ title: 'Services', tabBarIcon: ({ focused }) => <TabIcon icon="construct-outline" focused={focused} /> }}
        />
      )}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: t('navMore'), tabBarIcon: ({ focused }) => <TabIcon icon="ellipsis-horizontal-outline" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
