import React, { useMemo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/theme';
import { Text } from './ui/kit';

interface AvatarProps {
  name?: string;
  uri?: string | null;
  size?: number;
  style?: ViewStyle;
  /** Show a small camera icon overlay (for edit mode). */
  editable?: boolean;
}

export function Avatar({
  name,
  uri,
  size = 40,
  style,
  editable,
}: AvatarProps) {
  const { c } = useTheme();
  const radius = size / 2;

  const initials = useMemo(() => {
    const safe = (name ?? '').trim();
    if (!safe) return '';
    return safe
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [name]);

  const hasImage = !!uri;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: c.surfaceAlt,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: uri! }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => {
            /* If the file is gone, fall through to initials next render */
          }}
        />
      ) : initials ? (
        <Text
          style={{
            fontSize: size * 0.36,
            fontWeight: '600',
            letterSpacing: 0.6,
            color: c.text,
          }}
        >
          {initials}
        </Text>
      ) : (
        <Feather name="user" size={size * 0.42} color={c.text} />
      )}

      {editable && (
        <View
          style={[
            styles.editOverlay,
            {
              width: size * 0.4,
              height: size * 0.4,
              borderRadius: size * 0.2,
              backgroundColor: c.primary,
              borderColor: c.surface,
            },
          ]}
        >
          <Feather
            name="camera"
            size={size * 0.22}
            color={c.onPrimary}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});