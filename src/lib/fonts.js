import { createElement } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

// The UI designer's typeface is Inter. Screens keep writing `fontWeight: '700'`; this maps each weight to the
// matching Inter file once, here, so no screen has to name a font family.
const FAMILY = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
};

const familyFor = (weight) => {
  if (weight === 'bold') return FAMILY[700];
  const n = Number(weight);
  if (!Number.isFinite(n)) return FAMILY[400];
  if (n >= 800) return FAMILY[800];
  if (n >= 700) return FAMILY[700];
  if (n >= 600) return FAMILY[600];
  if (n >= 500) return FAMILY[500];
  return FAMILY[400];
};

let installed = false;

/** Makes every <Text> and <TextInput> render in Inter (unless a style names its own fontFamily, e.g. a code font). */
export function installInterText() {
  if (installed) return;
  installed = true;
  [Text, TextInput].forEach((Component) => {
    const render = Component && Component.render;
    if (typeof render !== 'function') return;
    Component.render = function renderWithInter(props, ref) {
      const flat = StyleSheet.flatten(props.style) || {};
      if (flat.fontFamily) return render.call(this, props, ref);
      // fontWeight is reset because the weight now lives in the font file (avoids a second, synthetic bold).
      return render.call(this, { ...props, style: [props.style, { fontFamily: familyFor(flat.fontWeight), fontWeight: 'normal' }] }, ref);
    };
  });
}

export function useInterFonts() {
  return useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
}
