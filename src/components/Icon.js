import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function Icon({ name, size = 18, color = colors.text, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
