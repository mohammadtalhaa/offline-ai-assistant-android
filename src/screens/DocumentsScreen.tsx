import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Text, Chip, IconButton } from '../components/ui/kit';
import { importDocument } from '../features/retrieval/documents';
import { deleteDocument, listDocuments } from '../services/database/db';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import type { DocRecord } from '../types';
import { formatBytes } from '../utils/format';
/* ------------------------------ helpers ------------------------------ */

type Filter = 'All' | 'PDF' | 'DOCX' | 'PPTX' | 'TXT' | 'MD' | 'Other';

const FILTERS: Filter[] = ['All', 'PDF', 'DOCX', 'PPTX', 'TXT', 'MD', 'Other'];

function categoryOf(name: string): Filter {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx') return 'DOCX';
  if (ext === 'ppt' || ext === 'pptx') return 'PPTX';
  if (ext === 'txt' || ext === 'log') return 'TXT';
  if (ext === 'md' || ext === 'markdown') return 'MD';
  return 'Other';
}

const ICON: Record<Filter, keyof typeof Feather.glyphMap> = {
  All: 'file-text',
  PDF: 'file-text',
  DOCX: 'file',
  PPTX: 'monitor',
  TXT: 'align-left',
  MD: 'hash',
  Other: 'code',
};

const ICON_COLOR: Record<Filter, string> = {
  All: '#7A7A75',
  PDF: '#D9534F',
  DOCX: '#4285F4',
  PPTX: '#F4A742',
  TXT: '#7A7A75',
  MD: '#4A4A45',
  Other: '#7B5FC7',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'Today';
  if (diff < day * 2) return 'Yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}

/* ------------------------------- screen ------------------------------- */

export default function DocumentsScreen() {
  const nav = useNavigation<any>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pro = useApp((s) => s.pro);

  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const importingRef = useRef(false);
  const mountedRef = useRef(true);

  /* -------- load -------- */

  const load = useCallback(async () => {
    try {
      const rows = await listDocuments();
      if (mountedRef.current) setDocs(rows);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Documents] load failed', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      load();
      return () => {
        mountedRef.current = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /* -------- import -------- */

  const onImport = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;

    if (!pro) {
      importingRef.current = false;
      nav.navigate('Upgrade');
      return;
    }

    setImporting(true);
    try {
      const r = await importDocument();
      if (!mountedRef.current) return;
      if (r.ok) {
        await load();
        Alert.alert(
          'Imported',
          `"${r.name}" is ready.\n\n${r.chunks} passages indexed on this device.`,
          [
            { text: 'Open chat', onPress: () => nav.navigate('Chat', { useDocs: true }) },
            { text: 'Done', style: 'cancel' },
          ],
        );
      } else if (r.reason !== 'cancelled') {
        Alert.alert('Could not import', r.reason);
      }
    } catch (e) {
      if (mountedRef.current) {
        Alert.alert('Could not import', (e as Error).message);
      }
    } finally {
      importingRef.current = false;
      if (mountedRef.current) setImporting(false);
    }
  }, [pro, nav, load]);

  /* -------- actions -------- */

  const onOpen = useCallback(
    (doc: DocRecord) => {
      nav.navigate('Chat', { useDocs: true });
    },
    [nav],
  );

  const onLongPress = useCallback(
    (doc: DocRecord) => {
      Alert.alert(doc.name, `${doc.chunkCount} passages · ${formatDate(doc.createdAt)}`, [
        {
          text: 'Ask in chat',
          onPress: () => nav.navigate('Chat', { useDocs: true }),
        },
        {
          text: 'Details',
          onPress: () =>
            Alert.alert(
              'Document details',
              `Name: ${doc.name}\nPassages: ${doc.chunkCount}\nText length: ${doc.chars.toLocaleString()} characters\nImported: ${new Date(doc.createdAt).toLocaleString()}`,
            ),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Delete this document?',
              `"${doc.name}" and its index will be removed. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteDocument(doc.id);
                    await load();
                  },
                },
              ],
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [nav, load],
  );

  /* -------- filtered list -------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== 'All' && categoryOf(d.name) !== filter) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, filter, query]);

  const summary = useMemo(() => {
    if (!docs.length) return null;
    const totalChars = docs.reduce((n, d) => n + d.chars, 0);
    const totalChunks = docs.reduce((n, d) => n + d.chunkCount, 0);
    return `${docs.length} ${docs.length === 1 ? 'document' : 'documents'} · ${totalChunks} passages · ${formatBytes(totalChars)} of text`;
  }, [docs]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of docs) {
      const cat = categoryOf(d.name);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [docs]);

  /* -------- render -------- */

  return (
    <Screen edges={{ top: true, bottom: false }}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: spacing.md }]}>
          <IconButton
            name={searchOpen ? 'x' : 'search'}
            onPress={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery('');
            }}
            accessibilityLabel={searchOpen ? 'Close search' : 'Search documents'}
          />
          <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>
            Documents
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Title + summary */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>
          <Text variant="title">Your library</Text>
          {summary && (
            <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
              {summary}
            </Text>
          )}
        </View>

        {/* Search bar */}
        {searchOpen && (
          <View
            style={[
              styles.searchBar,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Feather name="search" size={15} color={c.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name..."
              placeholderTextColor={c.textFaint}
              autoFocus
              style={[styles.searchInput, { color: c.text }]}
              returnKeyType="search"
              accessibilityLabel="Search documents by name"
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityLabel="Clear search"
              >
                <Feather name="x-circle" size={15} color={c.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Filter chips */}
        <View style={styles.chipRow}>
          {FILTERS.map((f) => {
            const count = f === 'All' ? docs.length : (filterCounts[f] ?? 0);
            if (f !== 'All' && count === 0) return null;
            return (
              <Chip
                key={f}
                label={f === 'All' ? `All · ${count}` : `${f} · ${count}`}
                active={filter === f}
                onPress={() => setFilter(f)}
              />
            );
          })}
        </View>

        {/* List */}
        <FlashList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: 180,
          }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={c.textMuted} />
              </View>
            ) : docs.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
                  <Feather name="file-text" size={26} color={c.textFaint} />
                </View>
                <Text
                  variant="heading"
                  style={{ marginTop: spacing.lg, textAlign: 'center' }}
                >
                  No documents yet
                </Text>
                <Text
                  variant="caption"
                  color="muted"
                  style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 280 }}
                >
                  Import a PDF, DOCX, PPTX, TXT, MD, CSV, or JSON file. Ask questions
                  and get cited answers — all offline.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Feather name="filter" size={24} color={c.textFaint} />
                <Text
                  variant="body"
                  color="muted"
                  style={{ marginTop: spacing.md, textAlign: 'center' }}
                >
                  No {filter !== 'All' ? filter : ''} documents
                  {query ? ' match your search' : ''}.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <DocumentRow
              doc={item}
              onPress={() => onOpen(item)}
              onLongPress={() => onLongPress(item)}
            />
          )}
        />

        {/* FAB */}
        <Pressable
          onPress={onImport}
          disabled={importing}
          accessibilityRole="button"
          accessibilityLabel={
            importing ? 'Importing document' : 'Import a document'
          }
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: c.primary,
              bottom: Math.max(insets.bottom, 12) + 76,
              opacity: pressed || importing ? 0.85 : 1,
            },
            shadow.lifted,
          ]}
        >
          {importing ? (
            <ActivityIndicator color={c.onPrimary} size="small" />
          ) : (
            <Feather name="plus" size={22} color={c.onPrimary} />
          )}
        </Pressable>

        {/* Import overlay */}
        {importing && (
          <View
            style={[styles.overlay, { backgroundColor: 'rgba(20,15,8,0.35)' }]}
            pointerEvents="auto"
          >
            <View
              style={[
                styles.overlayCard,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.lifted,
              ]}
            >
              <ActivityIndicator color={c.text} />
              <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>
                Importing…
              </Text>
              <Text
                variant="caption"
                color="muted"
                style={{ marginTop: spacing.xs, textAlign: 'center' }}
              >
                Extracting text and building the search index.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

/* ---------------------------- document row ---------------------------- */

function DocumentRow({
  doc,
  onPress,
  onLongPress,
}: {
  doc: DocRecord;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { c } = useTheme();
  const category = categoryOf(doc.name);
  const icon = ICON[category];
  const iconColor = ICON_COLOR[category];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${doc.name}, ${doc.chunkCount} passages`}
      accessibilityHint="Tap to ask questions. Long-press for options."
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View
        style={[
          styles.fileIcon,
          { backgroundColor: iconColor + '1A' },
        ]}
      >
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {doc.name}
        </Text>
        <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
          {doc.chunkCount} passages · {formatDate(doc.createdAt)}
        </Text>
      </View>
      <Feather name="more-vertical" size={18} color={c.textFaint} />
    </Pressable>
  );
}

/* ------------------------------- styles ------------------------------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  overlayCard: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing['3xl'],
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minWidth: 240,
  },
});