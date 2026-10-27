import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the screens (e.g. a tapped notification) open a screen.
export const navigationRef = createNavigationContainerRef();
