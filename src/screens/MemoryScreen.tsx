import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Text, Surface, Button, Input, FadeInView } from '../components/ui/kit';
import { addMemory, clearMemories, deleteMemory, listMemories } from '../services/database/db';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import type { MemoryItem } from '../types';

export default function MemoryScreen() {
  const { c } = useTheme();
  const enabled = useApp((s) => s.settings.useMemory);
  const setSettings = useApp((s) => s.setSettings);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [text, setText] = useState('');
  const load = useCallback(async () => setItems(await listMemories()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen scroll edges={{ top: false, bottom: true }}>
      <View style={{ padding: spacing.xl, paddingBottom: 140 }}>
        <FadeInView delay={0}>
          <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.border }, shadow.soft]}>
            <View style={[styles.heroIcon, { backgroundColor: c.surfaceAlt }]}>
              <Feather name="database" size={20} color={c.text} />
            </View>
            <Text variant="heading" style={{ marginTop: spacing.md }}>What the AI remembers</Text>
            <Text variant="caption" color="muted" style={{ marginTop: spacing.sm, lineHeight: 19 }}>
              Facts you save here are quietly added to every chat. They live only on this device.
            </Text>
            <Button
              title={enabled ? 'Memory is on' : 'Memory is off'}
              variant={enabled ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => setSettings({ useMemory: !enabled })}
              style={{ marginTop: spacing.lg }}
              icon={enabled ? 'check-circle' : 'circle'}
            />
          </View>
        </FadeInView>

        <FadeInView delay={80}>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Text variant="label" color="faint" style={{ marginBottom: spacing.sm }}>ADD A FACT</Text>
            <Surface>
              <Input
                value={text}
                onChangeText={setText}
                placeholder="e.g. I am a student. Keep answers short."
                multiline
                containerStyle={{ marginBottom: spacing.md, minHeight: 68 }}
              />
              <Button
                size="sm"
                icon="plus"
                title="Save"
                disabled={!text.trim()}
                onPress={async () => {
                  await addMemory(text.trim());
                  setText('');
                  load();
                }}
              />
            </Surface>
          </View>
        </FadeInView>

        <FadeInView delay={160}>
          <Text variant="label" color="faint" style={{ marginTop: spacing['2xl'], marginBottom: spacing.sm }}>
            SAVED · {items.length}
          </Text>
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
              <Feather name="inbox" size={26} color={c.textFaint} />
              <Text variant="body" color="muted" style={{ marginTop: spacing.md }}>
                Nothing saved yet
              </Text>
            </View>
          ) : (
            items.map((m, i) => (
              <FadeInView key={m.id} delay={200 + i * 30}>
                <Surface style={{ marginBottom: spacing.sm }}>
                  <Text variant="body" style={{ lineHeight: 22 }}>{m.text}</Text>
                  <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash-2"
                      title="Delete"
                      onPress={async () => {
                        await deleteMemory(m.id);
                        load();
                      }}
                    />
                  </View>
                </Surface>
              </FadeInView>
            ))
          )}
        </FadeInView>

        {items.length > 0 && (
          <Button
            title="Erase all memory"
            variant="ghost"
            size="sm"
            icon="trash"
            onPress={() =>
              Alert.alert('Erase all memory?', 'All saved facts will be deleted.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Erase',
                  style: 'destructive',
                  onPress: async () => {
                    await clearMemories();
                    load();
                  },
                },
              ])
            }
            style={{ marginTop: spacing.xl, alignSelf: 'center' }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = require('react-native').StyleSheet.create({
  hero: {
    borderRadius: 20,
    borderWidth: 0.5,
    padding: 20,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});