import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import ServiceDashboardScreen from '../screens/ServiceDashboardScreen';
import HybridDashboardScreen from '../screens/HybridDashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import StockManagementScreen from '../screens/StockManagementScreen';
import ServiceManagementScreen from '../screens/ServiceManagementScreen';
import StockAndServicesScreen from '../screens/StockAndServicesScreen';
import MoreScreen from '../screens/MoreScreen';
import SponsoredScreen from '../screens/SponsoredScreen';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }) {
  return <Icon name={focused ? icon.replace('-outline', '') : icon} size={22} color={focused ? colors.primary : colors.textMuted} />;
}

export default function MainTabs() {
  const { t } = useTranslation();
  const { state } = useApp();
  const model = state.business?.businessModel || 'Product-based';
  const isService = model === 'Service-based';
  const isHybrid = model === 'Hybrid';
  const Dashboard = isService ? ServiceDashboardScreen : isHybrid ? HybridDashboardScreen : DashboardScreen;

  const StockTab = isHybrid ? StockAndServicesScreen : isService ? ServiceManagementScreen : StockManagementScreen;
  const stockTabTitle = isHybrid ? t('stockAndServices.stockServices') : isService ? t('navServices') : t('navStock');

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6, borderTopColor: colors.border, backgroundColor: colors.bg },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={Dashboard}
        options={{ title: t('navHome'), tabBarIcon: ({ focused }) => <TabIcon icon="home-outline" focused={focused} /> }}
      />
      <Tab.Screen
        name="Activity"
        component={TransactionsScreen}
        options={{ title: t('navTransactions'), tabBarIcon: ({ focused }) => <TabIcon icon="pulse-outline" focused={focused} /> }}
      />
      <Tab.Screen
        name="StockTab"
        component={StockTab}
        options={{ title: stockTabTitle, tabBarIcon: ({ focused }) => <TabIcon icon="cube-outline" focused={focused} /> }}
      />
      <Tab.Screen
        name="Sponsored"
        component={SponsoredScreen}
        options={{ title: t('navSponsored'), tabBarIcon: ({ focused }) => <TabIcon icon="megaphone-outline" focused={focused} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: t('navMore'), tabBarIcon: ({ focused }) => <TabIcon icon="menu-outline" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
