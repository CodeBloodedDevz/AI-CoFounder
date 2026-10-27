export const colors = {
  // Brand gradient from the UI designer's prototype (coral -> violet).
  gradientStart: '#FF4D6D',
  gradientEnd: '#8234C6',

  // Accent used for active states, links and focus: the designer's violet.
  primary: '#8234C6',
  primaryDark: '#680EAC',
  primaryLight: '#F1DBFF',
  // The designer's crimson, used for small highlights (alerts, badges, the "Upgrade" link).
  crimson: '#B60E3D',
  crimsonLight: '#FFDADB',

  dark: '#293040',
  darkSoft: '#3A4256',

  bg: '#F9F9FF',
  appBg: '#EDF0FF',
  // Designer surfaces: white cards on the pale lavender page, with four tonal steps.
  surface: '#FFFFFF',
  surfaceLow: '#F1F3FF',
  surfaceMid: '#E9EDFF',
  surfaceHigh: '#E1E8FD',
  inputBg: '#F1F3FF',
  border: '#DCE2F7',
  text: '#141B2B',
  // Text colours meet WCAG AA contrast (4.5:1) on white.
  textMuted: '#7A5F61',
  textSoft: '#5A4042',

  success: '#006947',
  successBg: '#DDFBEE',
  warning: '#A8690C',
  warningBg: '#FDF3E3',
  danger: '#BA1A1A',
  dangerBg: '#FFDAD6',

  white: '#FFFFFF',
};

export const gradient = {
  colors: [colors.gradientStart, colors.gradientEnd],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0.15 },
};

// Widest a page's content gets on tablets and desktop browsers (it is centred), so forms and lists
// stay comfortable to read instead of stretching across a wide screen.
export const layout = { maxContentWidth: 720 };

// Shared text styles so every page uses the same heading hierarchy:
//   pageTitle > pageSubtitle   (top of a page)
//   sectionTitle               (a block inside a page: "Recent activity", "Customer list")
//   formTitle                  (the heading inside a form card)
export const type = {
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 28, letterSpacing: -0.4 },
  pageSubtitle: { marginTop: 4, fontSize: 13.5, color: colors.textSoft, lineHeight: 19 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10, letterSpacing: -0.2 },
  formTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12, letterSpacing: -0.2 },
};

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#141B2B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: '#141B2B',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 6,
  },
};
