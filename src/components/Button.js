import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';

const VARIANTS = {
  primary: { bg: colors.primary, text: colors.white, border: 'transparent' },
  outline: { bg: 'transparent', text: colors.text, border: colors.border },
  'outline-accent': { bg: 'transparent', text: colors.primary, border: colors.primary },
  'outline-danger': { bg: 'transparent', text: colors.danger, border: colors.danger },
};

export default function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
}) {
  const palette = VARIANTS[variant] || VARIANTS.primary;
  const isSmall = size === 'sm';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1.5,
          paddingVertical: isSmall ? 9 : 14,
          opacity: pressed ? 0.85 : disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <>
          {icon && iconPosition === 'left' && <Icon name={icon} size={isSmall ? 14 : 16} color={palette.text} style={styles.iconLeft} />}
          <Text style={[styles.text, { color: palette.text, fontSize: isSmall ? 13 : 15 }]}>{children}</Text>
          {icon && iconPosition === 'right' && <Icon name={icon} size={isSmall ? 14 : 16} color={palette.text} style={styles.iconRight} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: '700',
  },
  iconLeft: { marginRight: 6 },
  iconRight: { marginLeft: 6 },
});
