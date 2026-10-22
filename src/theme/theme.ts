import { useColorScheme } from 'react-native';
import { palette, type ColorScheme } from './tokens';
import { useApp } from '../store/useApp';

export { spacing, radii, type, palette, fonts, shadow } from './tokens';
export type { ColorScheme } from './tokens';

export function useTheme(): { dark: boolean; c: ColorScheme } {
  const system = useColorScheme();
  const pref = useApp((s) => s.settings.theme);
  const dark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return { dark, c: dark ? palette.dark : palette.light };
}