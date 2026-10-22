import React from 'react';
import { StyleSheet, View, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { Message, SourceRef } from '../../types';
import { useTheme, spacing, radii } from '../../theme/theme';
import { Text, IconButton } from '../ui/kit';

interface Props {
  message: Message;
  streaming?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, streaming, canRegenerate, onRegenerate }: Props) {
  const { c } = useTheme();
  const isUser = message.role === 'user';

  let sources: SourceRef[] = [];
  if (message.sources) {
    try {
      sources = JSON.parse(message.sources) as SourceRef[];
    } catch {
      /* ignore malformed */
    }
  }

  if (isUser) {
    return (
      <Animated.View
        entering={FadeInDown.duration(260).springify().damping(18)}
        style={styles.userWrap}
      >
        <View style={[styles.userBubble, { backgroundColor: c.bubbleUser }]}>
          <Text
            style={{
              color: c.bubbleUserText,
              fontSize: 15,
              lineHeight: 22,
              letterSpacing: 0.1,
            }}
          >
            {message.content}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(60).springify().damping(18)}
      style={styles.asstWrap}
    >
      <View style={{ paddingHorizontal: spacing.xl }}>
        <Text
          selectable
          style={{
            color: c.text,
            fontSize: 15.5,
            lineHeight: 25,
            letterSpacing: 0.1,
          }}
        >
          {message.content || (streaming ? '▍' : '')}
        </Text>

        {sources.length > 0 && (
          <View
            style={[
              styles.sourcesBox,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <View style={styles.sourcesHeader}>
              <Feather name="book-open" size={12} color={c.textMuted} />
              <Text variant="label" color="muted" style={{ marginLeft: 6 }}>
                SOURCES
              </Text>
            </View>
            {sources.map((s) => (
              <View key={s.n} style={styles.sourceRow}>
                <Text variant="caption" color="faint" style={{ width: 22 }}>
                  [{s.n}]
                </Text>
                <Text variant="caption" color="muted" style={{ flex: 1 }} numberOfLines={2}>
                  {s.doc} — {s.snippet}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!streaming && !!message.content && (
        <View style={styles.actions}>
          <IconButton
            name="copy"
            size={32}
            onPress={() => Clipboard.setStringAsync(message.content)}
            color={c.textFaint}
          />
          <IconButton
            name="share-2"
            size={32}
            onPress={() => Share.share({ message: message.content })}
            color={c.textFaint}
          />
          {canRegenerate && (
            <IconButton
              name="refresh-cw"
              size={32}
              onPress={onRegenerate}
              color={c.textFaint}
            />
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  userWrap: {
    paddingHorizontal: spacing.xl,
    marginVertical: spacing.md,
    alignItems: 'flex-end',
  },
  userBubble: {
    maxWidth: '82%',
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  asstWrap: {
    marginVertical: spacing.md,
  },
  sourcesBox: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl - 4,
  },
});