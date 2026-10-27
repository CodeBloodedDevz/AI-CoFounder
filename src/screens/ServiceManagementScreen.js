import { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ServiceManager from '../components/ServiceManager';
import { type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { useApp } from '../context/AppContext';

// The Services tab (service businesses): add, edit and delete the services offered.
export default function ServiceManagementScreen() {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const { reloadData } = useApp();
  return (
    <Screen scrollRef={scrollRef} onRefresh={reloadData}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('navServices')}</Text>
        <Text style={styles.subtitle}>{t('serviceManagement.manageTheServicesYourBusiness')}</Text>
      </View>
      <ServiceManager onEditStart={() => scrollRef.current?.scrollTo?.({ y: 0, animated: true })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
});
