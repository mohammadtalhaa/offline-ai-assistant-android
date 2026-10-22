export interface ColorScheme {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  primary: string;
  onPrimary: string;
  accent: string;
  danger: string;
  success: string;
  bubbleUser: string;
  bubbleUserText: string;
  bubbleAsst: string;
  bubbleAsstText: string;
  card: string;
  sub: string;
  ok: string;
  shadow: string;
}

const light: ColorScheme = {
  bg: '#F6F3EC',
  bgDeep: '#EFEADF',
  surface: '#FDFCFA',
  surfaceAlt: '#F1EDE4',
  surfaceElevated: '#FFFFFF',
  text: '#1A1715',
  textMuted: '#6F675E',
  textFaint: '#A39B90',
  border: '#E7E1D5',
  borderStrong: '#D5CDBC',
  primary: '#1A1715',
  onPrimary: '#FDFCFA',
  accent: '#8A6B4A',
  danger: '#B04A3C',
  success: '#527A4E',
  bubbleUser: '#1A1715',
  bubbleUserText: '#F6F3EC',
  bubbleAsst: '#FDFCFA',
  bubbleAsstText: '#1A1715',
  card: '#FDFCFA',
  sub: '#6F675E',
  ok: '#527A4E',
  shadow: 'rgba(60,45,25,0.10)',
};

const dark: ColorScheme = {
  bg: '#0E0D0B',
  bgDeep: '#0A0908',
  surface: '#191713',
  surfaceAlt: '#221F1A',
  surfaceElevated: '#1E1B17',
  text: '#F5F0E6',
  textMuted: '#9C948A',
  textFaint: '#5F5950',
  border: '#26221B',
  borderStrong: '#38332A',
  primary: '#F5F0E6',
  onPrimary: '#0E0D0B',
  accent: '#D4B085',
  danger: '#E57060',
  success: '#8CC48F',
  bubbleUser: '#F5F0E6',
  bubbleUserText: '#0E0D0B',
  bubbleAsst: '#191713',
  bubbleAsstText: '#F5F0E6',
  card: '#191713',
  sub: '#9C948A',
  ok: '#8CC48F',
  shadow: 'rgba(0,0,0,0.5)',
};

export const palette = { light, dark };

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 40,
} as const;

export const radii = {
  sm: 8, md: 10, lg: 14, xl: 18, '2xl': 24, pill: 999,
} as const;

/** Font families — serif for titles gives the paper/journal feel */
export const fonts = {
  display: 'Georgia',
  heading: 'Georgia',
  body: undefined,
} as const;

export const type = {
  display: { fontFamily: 'Georgia', fontSize: 34, fontWeight: '400' as const, letterSpacing: -0.5, lineHeight: 40 },
  title: { fontFamily: 'Georgia', fontSize: 26, fontWeight: '400' as const, letterSpacing: -0.4, lineHeight: 32 },
  heading: { fontFamily: 'Georgia', fontSize: 18, fontWeight: '400' as const, letterSpacing: -0.2, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: 0.1, lineHeight: 23 },
  bodyStrong: { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0.1, lineHeight: 23 },
  caption: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0.2, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.8, lineHeight: 16, textTransform: 'uppercase' as const },
} as const;

export const shadow = {
  soft: {
    shadowColor: '#3C2D19',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#3C2D19',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;