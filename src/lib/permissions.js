import { Linking, Platform } from 'react-native';

/** Opens this app's page in the phone's Settings (to turn the microphone back on). False on the web. */
export async function openAppSettings() {
  if (Platform.OS === 'web') return false;
  try {
    await Linking.openSettings();
    return true;
  } catch (e) {
    return false;
  }
}

/** On the web the browser asks for the microphone itself; there is no settings page to send people to. */
export const canOpenSettings = Platform.OS !== 'web';
