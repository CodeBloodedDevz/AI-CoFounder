export const colors = {
  // Brand gradient — sampled from the approved UI prototype (coral → purple).
  gradientStart: '#FB5561',
  gradientEnd: '#6E2BFA',

  primary: '#6E2BFA',
  primaryDark: '#5A1FDB',
  primaryLight: '#EDE6FE',

  dark: '#1E1A2E',
  darkSoft: '#2A2440',

  bg: '#FFFFFF',
  appBg: '#EDEAF4',
  inputBg: '#F3F1F8',
  border: '#E6E2EF',
  text: '#141221',
  textMuted: '#8A8694',
  textSoft: '#55505F',

  success: '#22A45D',
  successBg: '#E8F8EE',
  warning: '#E8A33D',
  warningBg: '#FDF3E3',
  danger: '#E8493D',
  dangerBg: '#FDECEA',

  white: '#FFFFFF',
};

export const gradient = {
  colors: [colors.gradientStart, colors.gradientEnd],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0.15 },
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#17131F',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: '#17131F',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 6,
  },
};
