import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type TextInputProps,
  type TextProps as RNTextProps,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme, spacing, radii, type as typeStyles, shadow } from '../../theme/theme';

const APress = Animated.createAnimatedComponent(Pressable);

const MIN_TOUCH = 44;

/* -------------------------------------------------------------------------- */
/*                                   Screen                                   */
/* -------------------------------------------------------------------------- */

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: { top?: boolean; bottom?: boolean };
  scrollProps?: ScrollViewProps;
  style?: ViewStyle;
}

export function Screen({
  children,
  scroll,
  edges = { top: true, bottom: false },
  scrollProps,
  style,
}: ScreenProps) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const pt = edges.top ? insets.top : 0;
  const pb = edges.bottom ? insets.bottom : 0;

  const gradient: [string, string, string] = dark
    ? ['#0E0D0B', '#131210', '#0E0D0B']
    : ['#F6F3EC', '#F3EFE6', '#F6F3EC'];

  const background = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );

  if (scroll) {
    return (
      <View style={[styles.screenRoot, { backgroundColor: c.bg }, style]}>
        {background}
        <ScrollView
          {...scrollProps}
          contentContainerStyle={[
            { paddingTop: pt, paddingBottom: pb },
            scrollProps?.contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screenRoot, { backgroundColor: c.bg }, style]}>
      {background}
      <View style={[styles.screenInner, { paddingTop: pt, paddingBottom: pb }]}>
        {children}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Text                                    */
/* -------------------------------------------------------------------------- */

type Variant = keyof typeof typeStyles;
type ColorKey = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'onPrimary';

interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: ColorKey;
}

export function Text({ variant = 'body', color = 'default', style, ...rest }: TextProps) {
  const { c } = useTheme();
  const map: Record<ColorKey, string> = {
    default: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    accent: c.accent,
    danger: c.danger,
    success: c.success,
    onPrimary: c.onPrimary,
  };
  return (
    <RNText
      {...rest}
      allowFontScaling
      style={[typeStyles[variant] as any, { color: map[color] }, style]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Surface                                   */
/* -------------------------------------------------------------------------- */

interface SurfaceProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  onPress?: () => void;
  elevated?: boolean;
  accessibilityLabel?: string;
}

export function Surface({
  children,
  style,
  padded = true,
  onPress,
  elevated,
  accessibilityLabel,
}: SurfaceProps) {
  const { c, dark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: radii.xl,
    padding: padded ? spacing.lg : 0,
    ...(elevated ? { ...shadow.soft, shadowColor: dark ? '#000' : '#3C2D19' } : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          base,
          { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

/* -------------------------------------------------------------------------- */
/*                                   Button                                   */
/* -------------------------------------------------------------------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const BTN_HEIGHTS: Record<BtnSize, number> = { sm: 38, md: 48, lg: 54 };
const BTN_PADS: Record<BtnSize, number> = {
  sm: spacing.md,
  md: spacing.xl,
  lg: spacing['2xl'],
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  fullWidth,
  icon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { c } = useTheme();
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isDisabled = !!disabled || !!loading;

  const bg =
    variant === 'primary'
      ? c.primary
      : variant === 'danger'
      ? c.danger
      : variant === 'secondary'
      ? c.surfaceAlt
      : 'transparent';

  const fg =
    variant === 'primary'
      ? c.onPrimary
      : variant === 'danger'
      ? '#FFFFFF'
      : c.text;

  return (
    <APress
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.96, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 18, stiffness: 400 });
      }}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      testID={testID}
      hitSlop={BTN_HEIGHTS[size] < MIN_TOUCH ? 4 : undefined}
      style={[
        styles.btn,
        {
          height: BTN_HEIGHTS[size],
          paddingHorizontal: BTN_PADS[size],
          backgroundColor: bg,
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: variant === 'ghost' ? c.borderStrong : 'transparent',
          opacity: disabled ? 0.4 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        anim,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Feather name={icon} size={size === 'sm' ? 14 : 16} color={fg} />}
          <RNText
            allowFontScaling
            numberOfLines={1}
            style={{
              color: fg,
              fontWeight: '500',
              fontSize: size === 'sm' ? 13 : 15,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </RNText>
        </View>
      )}
    </APress>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 IconButton                                 */
/* -------------------------------------------------------------------------- */

interface IconButtonProps {
  name: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
  color?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function IconButton({
  name,
  onPress,
  size = MIN_TOUCH,
  disabled,
  style,
  color,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: IconButtonProps) {
  const { c } = useTheme();
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // If the visual size is smaller than the 44pt minimum, expand the tap area.
  const hitSlop = size < MIN_TOUCH ? Math.ceil((MIN_TOUCH - size) / 2) : undefined;

  return (
    <APress
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(0.88, { damping: 15, stiffness: 400 });
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 15, stiffness: 400 });
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      hitSlop={hitSlop ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : undefined}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        anim,
        style,
      ]}
    >
      <Feather name={name} size={Math.round(size * 0.45)} color={color ?? c.text} />
    </APress>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Input                                    */
/* -------------------------------------------------------------------------- */

interface InputProps extends TextInputProps {
  containerStyle?: ViewStyle;
}

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  { containerStyle, style, accessibilityLabel, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.inputWrap,
        { backgroundColor: c.surface, borderColor: c.border },
        containerStyle,
      ]}
    >
      <TextInput
        ref={ref}
        {...rest}
        allowFontScaling
        accessibilityLabel={accessibilityLabel ?? rest.placeholder}
        placeholderTextColor={c.textFaint}
        style={[styles.input, { color: c.text }, style]}
      />
    </View>
  );
});
Input.displayName = 'Input';

/* -------------------------------------------------------------------------- */
/*                                    Chip                                    */
/* -------------------------------------------------------------------------- */

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Chip({ label, active, onPress, accessibilityLabel }: ChipProps) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? c.primary : c.surface,
          borderColor: active ? c.primary : c.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <RNText
        allowFontScaling
        numberOfLines={1}
        style={{
          color: active ? c.onPrimary : c.text,
          fontSize: 13,
          fontWeight: '500',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  ListRow                                   */
/* -------------------------------------------------------------------------- */

interface ListRowProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
  accessibilityLabel?: string;
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  last,
  accessibilityLabel,
}: ListRowProps) {
  const { c } = useTheme();

  const inner = (
    <View
      style={[
        styles.rowInner,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
      ]}
    >
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: c.surfaceAlt }]}>
          <Feather name={icon} size={16} color={c.text} />
        </View>
      )}
      <View style={styles.rowTextWrap}>
        <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={c.textFaint} /> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
        hitSlop={4}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/* -------------------------------------------------------------------------- */
/*                                  Divider                                   */
/* -------------------------------------------------------------------------- */

export function Divider({ style }: { style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.divider, { backgroundColor: c.border }, style]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                FadeInView                                  */
/* -------------------------------------------------------------------------- */

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}

export function FadeInView({ children, delay = 0, style }: FadeInViewProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }
  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(delay).springify().damping(20)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  screenInner: { flex: 1 },

  btn: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  inputWrap: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  input: { fontSize: 15, padding: 0, margin: 0 },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: 'center',
  },

  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: { flex: 1 },
  rowSubtitle: { marginTop: 2 },

  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});