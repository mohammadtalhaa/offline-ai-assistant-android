import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Text, IconButton } from '../components/ui/kit';
import { MessageBubble } from '../components/common/MessageBubble';
import { generateReply, stopGeneration } from '../features/chat/chatService';
import { extractOnly } from '../features/retrieval/documents';
import {
  addMemory,
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listMessages,
  renameConversation,
  setArchived,
  updateMessage,
} from '../services/database/db';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import type { Attachment, Message } from '../types';
import type { RootStackParams } from '../navigation/types';

/* ------------------------------------------------------------------ *
 *  Constants
 * ------------------------------------------------------------------ */

const MAX_INLINE_DOC_CHARS = 6000;
const SCROLL_DEBOUNCE_MS = 60;
const SCROLL_BOTTOM_THRESHOLD = 120; // px from bottom before hiding the FAB
const SUPPORTED_DOC_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'log', 'html', 'htm', 'xml',
  'docx', 'pptx', 'pdf',
]);

function attachmentId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/* ------------------------------------------------------------------ *
 *  Screen
 * ------------------------------------------------------------------ */

export default function ChatScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, 'Chat'>) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const p = route.params;

  // Store — granular selectors
  const settings = useApp((s) => s.settings);
  const pro = useApp((s) => s.pro);
  const ensureEngineReady = useApp((s) => s.ensureEngineReady);
  const recordSpeed = useApp((s) => s.recordSpeed);

  // Local state
  const [convId, setConvId] = useState<string | undefined>(p?.conversationId);
  const [presetId] = useState(p?.presetId ?? 'general');
  const [useDocs] = useState(!!p?.useDocs);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(p?.prompt ?? '');
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [tps, setTps] = useState<number | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [tokens, setTokens] = useState(0);

  // Refs — synchronous locks and mounted guard
  const listRef = useRef<FlashListRef<Message> | null>(null);
  const sendingRef = useRef(false);
  const extractingRef = useRef(false);
  const mountedRef = useRef(true);
  const promptConsumedRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convIdRef = useRef<string | undefined>(p?.conversationId);
  const messagesRef = useRef<Message[]>([]);

  /* ---------------------- syncing refs ---------------------- */

  useEffect(() => {
    convIdRef.current = convId;
  }, [convId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ---------------------- lifecycle ---------------------- */

  // Load history
  useEffect(() => {
    (async () => {
      if (!p?.conversationId) return;
      try {
        const cv = await getConversation(p.conversationId);
        if (cv && mountedRef.current) navigation.setOptions({ title: cv.title });
        const msgs = await listMessages(p.conversationId);
        if (mountedRef.current) setMessages(msgs);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Chat] load failed', e);
      }
    })();
  }, [p?.conversationId, navigation]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopGeneration().catch(() => {});
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Consume initial prompt exactly once
  useEffect(() => {
    if (!p?.prompt || promptConsumedRef.current) return;
    promptConsumedRef.current = true;
  }, [p?.prompt]);

  /* ---------------------- helpers ---------------------- */

  const patch = useCallback((id: string, changes: Partial<Message>) => {
    if (!mountedRef.current) return;
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const scrollEnd = useCallback((animated = true) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, SCROLL_DEBOUNCE_MS);
  }, []);

  const onListScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollFab(distanceFromBottom > SCROLL_BOTTOM_THRESHOLD);
  }, []);

  /* ---------------------- attachments ---------------------- */

  const pickImage = useCallback(async (source: 'camera' | 'library') => {
    setPickerOpen(false);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera permission needed', 'Enable camera access in Settings.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        setAttachments((prev) => [
          ...prev,
          {
            id: attachmentId(),
            kind: 'image',
            name: a.fileName ?? `photo-${Date.now()}.jpg`,
            uri: a.uri,
            size: a.fileSize,
            mimeType: a.mimeType,
          },
        ]);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Photo access needed', 'Enable photo access in Settings.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });
        if (res.canceled || !res.assets?.length) return;
        const a = res.assets[0];
        setAttachments((prev) => [
          ...prev,
          {
            id: attachmentId(),
            kind: 'image',
            name: a.fileName ?? `photo-${Date.now()}.jpg`,
            uri: a.uri,
            size: a.fileSize,
            mimeType: a.mimeType,
          },
        ]);
      }
    } catch (e) {
      Alert.alert('Could not attach image', (e as Error).message);
    }
  }, []);

  const pickDocument = useCallback(async () => {
    setPickerOpen(false);
    if (extractingRef.current) return;
    extractingRef.current = true;
    setExtracting(true);

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;

      const a = res.assets[0];
      const ext = fileExt(a.name);

      if (!SUPPORTED_DOC_EXTS.has(ext)) {
        Alert.alert(
          'Unsupported file',
          `".${ext}" is not supported. Try PDF, DOCX, PPTX, TXT, MD, CSV, or JSON.`,
        );
        return;
      }

      const result = await extractOnly(a.uri, a.name);
      if (!result.ok) {
        Alert.alert('Could not read file', result.reason);
        return;
      }

      let text = result.text;
      if (text.length > MAX_INLINE_DOC_CHARS) {
        text =
          text.slice(0, MAX_INLINE_DOC_CHARS) +
          '\n\n…[truncated — attach via Documents tab for full retrieval]';
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: attachmentId(),
          kind: 'document',
          name: a.name,
          uri: a.uri,
          size: a.size ?? undefined,
          mimeType: a.mimeType,
          text,
        },
      ]);
    } catch (e) {
      Alert.alert('Could not attach document', (e as Error).message);
    } finally {
      extractingRef.current = false;
      if (mountedRef.current) setExtracting(false);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /* ---------------------- generation ---------------------- */

  const run = useCallback(
    async (assistantId: string, history: Message[]) => {
      setTps(null);
      setTokens(0);
      try {
        const out = await generateReply({
          assistantId,
          presetId,
          history,
          settings,
          useDocs: useDocs && pro,
          onPartial: (t) => {
            patch(assistantId, { content: t });
            setTokens((n) => n + t.length);
            scrollEnd();
          },
        });
        patch(assistantId, { content: out.text, sources: out.sources });
        if (out.tokensPerSecond && settings.activeModelId) {
          setTps(out.tokensPerSecond);
          recordSpeed(settings.activeModelId, out.tokensPerSecond);
        }
      } catch (e) {
        const msg = `⚠️ ${(e as Error).message}`;
        patch(assistantId, { content: msg });
        await updateMessage(assistantId, msg).catch(() => {});
      }
    },
    [
      presetId,
      settings,
      useDocs,
      pro,
      patch,
      scrollEnd,
      recordSpeed,
    ],
  );

  /* ---------------------- regenerate ---------------------- */

  const regenerate = useCallback(async () => {
    if (sendingRef.current) return;
    const msgs = messagesRef.current;
    const lastIdx = msgs.length - 1;
    const last = msgs[lastIdx];
    if (!last || last.role !== 'assistant') return;

    const userIdx = lastIdx - 1;
    if (userIdx < 0) return;

    sendingRef.current = true;
    setBusy(true);
    patch(last.id, { content: '', sources: null });
    await updateMessage(last.id, '').catch(() => {});

    try {
      const history = msgs.slice(0, lastIdx);
      await run(last.id, history);
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        scrollEnd();
      }
    }
  }, [patch, run, scrollEnd]);

  /* ---------------------- send ---------------------- */

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      const rawText = input.trim();
      const hasAttachments = attachments.length > 0;

      if (!rawText && !hasAttachments) return;
      if (extracting) return;

      // Slash command — only when no attachments
      if (!hasAttachments && rawText.startsWith('/remember ')) {
        const m = rawText.match(/^\/remember\s+(.+)/i);
        if (m) {
          await addMemory(m[1]);
          setInput('');
          Alert.alert('Saved', 'Added to memory.');
          return;
        }
      }

      const ready = await ensureEngineReady();
      if (!ready.ok) {
        Alert.alert('Model needed', ready.reason ?? 'Model unavailable.');
        return;
      }

      setBusy(true);
      setInput('');
      setTps(null);
      setTokens(0);

      // Build enriched content from attachments
      const parts: string[] = [];
      for (const a of attachments) {
        if (a.kind === 'document' && a.text) {
          parts.push(`[Attached document: ${a.name}]\n\n${a.text}`);
        } else if (a.kind === 'image') {
          parts.push(`[User attached an image: ${a.name}]`);
        }
      }
      if (rawText) parts.push(rawText);
      const enrichedText = parts.join('\n\n---\n\n');

      const priorMessages = messagesRef.current;
      const attachmentsJson =
        attachments.length > 0 ? JSON.stringify(attachments) : null;

      // Ensure conversation exists
      let id = convIdRef.current;
      if (!id) {
        const title = (
          rawText ||
          attachments[0]?.name ||
          'New chat'
        )
          .replace(/\s+/g, ' ')
          .slice(0, 40);
        const cv = await createConversation(title, presetId);
        id = cv.id;
        convIdRef.current = id;
        if (mountedRef.current) {
          setConvId(id);
          navigation.setOptions({ title: cv.title });
        }
      }

      // Persist messages
      const userMsg = await addMessage(
        id,
        'user',
        enrichedText,
        null,
        attachmentsJson,
      );
      const asstMsg = await addMessage(id, 'assistant', '');

      if (!mountedRef.current) return;

      // Clear attachments after successful persist
      setAttachments([]);

      const nextMessages = [...priorMessages, userMsg, asstMsg];
      setMessages(nextMessages);
      scrollEnd();

      await run(asstMsg.id, [...priorMessages, userMsg]);
    } catch (e) {
      if (mountedRef.current) {
        Alert.alert('Something went wrong', (e as Error).message);
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        scrollEnd();
      }
    }
  }, [
    input,
    attachments,
    extracting,
    ensureEngineReady,
    presetId,
    navigation,
    run,
    scrollEnd,
  ]);

  /* ---------------------- header menu actions ---------------------- */

  const onMenuRename = useCallback(() => {
    setMenuOpen(false);
    if (!convIdRef.current) return;
    const current =
      messagesRef.current.length > 0
        ? undefined
        : undefined;
    Alert.prompt?.(
      'Rename conversation',
      undefined,
      async (text: string) => {
        const next = text?.trim();
        if (!next) return;
        await renameConversation(convIdRef.current!, next);
        navigation.setOptions({ title: next });
      },
      'plain-text',
      current,
    );
  }, [navigation]);

  const onMenuArchive = useCallback(async () => {
    setMenuOpen(false);
    const id = convIdRef.current;
    if (!id) return;
    await setArchived(id, true);
    navigation.goBack();
  }, [navigation]);

  const onMenuShare = useCallback(async () => {
    setMenuOpen(false);
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const text = msgs
      .map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`)
      .join('\n\n');
    try {
      await Share.share({ message: text.slice(0, 20000) });
    } catch {
      /* ignore */
    }
  }, []);

  const onMenuDelete = useCallback(() => {
    setMenuOpen(false);
    const id = convIdRef.current;
    if (!id) return;
    Alert.alert('Delete conversation?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(id);
          navigation.goBack();
        },
      },
    ]);
  }, [navigation]);

  const onMenuClear = useCallback(() => {
    setMenuOpen(false);
    Alert.alert('Clear messages?', 'The conversation will be emptied.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const msgs = messagesRef.current;
          for (const m of msgs) {
            await updateMessage(m.id, '');
          }
          setMessages([]);
        },
      },
    ]);
  }, []);

  /* ---------------------- derived ---------------------- */

  const lastIdx = messages.length - 1;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !busy &&
    !extracting;
  const showAttachmentBar = attachments.length > 0 || extracting;
  const showStatus = busy || tps !== null;

  /* ---------------------- render ---------------------- */

  return (
    <Screen edges={{ top: false, bottom: false }}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + spacing.md,
              borderBottomColor: c.border,
              backgroundColor: c.bg,
            },
          ]}
        >
          <IconButton name="arrow-left" onPress={() => navigation.goBack()} />
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            style={{ flex: 1, textAlign: 'center', marginHorizontal: spacing.sm }}
          >
            Chat
          </Text>
          <IconButton
            name="more-horizontal"
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Conversation options"
          />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          enabled
        >
          <View style={{ flex: 1 }}>
            <FlashList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{
                paddingVertical: spacing.md,
                paddingBottom: spacing.lg,
              }}
              onContentSizeChange={() => scrollEnd()}
              onScroll={onListScroll}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Feather name="feather" size={28} color={c.textFaint} />
                  <Text
                    variant="body"
                    color="muted"
                    style={{ textAlign: 'center', marginTop: spacing.md }}
                  >
                    Ask anything. Attach a file. Everything runs on this phone.
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <MessageBubble
                  message={item}
                  streaming={busy && index === lastIdx}
                  canRegenerate={
                    index === lastIdx &&
                    item.role === 'assistant' &&
                    !busy &&
                    messages.length > 1
                  }
                  onRegenerate={regenerate}
                />
              )}
            />

            {/* Scroll-to-bottom FAB */}
            {showScrollFab && messages.length > 0 && (
              <Pressable
                onPress={() => {
                  listRef.current?.scrollToEnd({ animated: true });
                  setShowScrollFab(false);
                }}
                style={[
                  styles.scrollFab,
                  {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                  },
                  shadow.soft,
                ]}
                accessibilityLabel="Scroll to bottom"
              >
                <Feather name="arrow-down" size={18} color={c.text} />
              </Pressable>
            )}
          </View>

          {/* Status pill */}
          {showStatus && (
            <View style={styles.statusRow}>
              {busy ? (
                <>
                  <ActivityIndicator size="small" color={c.textMuted} />
                  <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
                    Generating{tokens > 0 ? ` · ${tokens} chars` : ''}
                  </Text>
                </>
              ) : tps ? (
                <Text variant="caption" color="faint">
                  {tps.toFixed(1)} t/s
                </Text>
              ) : null}
            </View>
          )}

          {/* Attachment chips */}
          {showAttachmentBar && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachRow}
              style={[styles.attachScroll, { borderTopColor: c.border }]}
            >
              {extracting && (
                <View
                  style={[
                    styles.attachChip,
                    { backgroundColor: c.surfaceAlt, borderColor: c.border },
                  ]}
                >
                  <ActivityIndicator size="small" color={c.textMuted} />
                  <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
                    Reading…
                  </Text>
                </View>
              )}
              {attachments.map((a) => (
                <View
                  key={a.id}
                  style={[
                    styles.attachChip,
                    { backgroundColor: c.surface, borderColor: c.border },
                  ]}
                >
                  <Feather
                    name={a.kind === 'image' ? 'image' : 'file-text'}
                    size={13}
                    color={c.textMuted}
                  />
                  <Text
                    variant="caption"
                    numberOfLines={1}
                    style={{ marginLeft: 6, maxWidth: 140 }}
                  >
                    {a.name}
                  </Text>
                  <Pressable
                    onPress={() => removeAttachment(a.id)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${a.name}`}
                    style={{ marginLeft: 6 }}
                  >
                    <Feather name="x" size={13} color={c.textMuted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Composer */}
          <View
            style={[
              styles.composer,
              {
                backgroundColor: c.bg,
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            <View
              style={[
                styles.composerInput,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.soft,
              ]}
            >
              <Pressable
                onPress={() => setPickerOpen(true)}
                disabled={busy || extracting}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Attach file"
                style={styles.attachBtn}
              >
                <Feather
                  name="paperclip"
                  size={18}
                  color={busy || extracting ? c.textFaint : c.textMuted}
                />
              </Pressable>

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask anything…"
                placeholderTextColor={c.textFaint}
                multiline
                editable={!busy}
                style={[styles.inputText, { color: c.text }]}
              />

              <Pressable
                onPress={busy ? () => stopGeneration() : send}
                disabled={!busy && !canSend}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Stop generating' : 'Send message'}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: busy || canSend ? c.primary : c.surfaceAlt,
                  },
                ]}
              >
                <Feather
                  name={busy ? 'square' : 'arrow-up'}
                  size={16}
                  color={busy || canSend ? c.onPrimary : c.textFaint}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Attachment picker */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="heading" style={{ marginBottom: spacing.lg }}>
              Attach
            </Text>
            <SheetRow
              icon="camera"
              title="Take photo"
              onPress={() => pickImage('camera')}
            />
            <SheetRow
              icon="image"
              title="Photo library"
              onPress={() => pickImage('library')}
            />
            <SheetRow
              icon="file-text"
              title="Document"
              sub="PDF, DOCX, PPTX, TXT, MD"
              onPress={pickDocument}
              last
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="heading" style={{ marginBottom: spacing.lg }}>
              Conversation
            </Text>
            {convId && (
              <SheetRow icon="edit-2" title="Rename" onPress={onMenuRename} />
            )}
            <SheetRow icon="share-2" title="Share transcript" onPress={onMenuShare} />
            {messages.length > 0 && (
              <SheetRow icon="x-circle" title="Clear messages" onPress={onMenuClear} />
            )}
            {convId && (
              <SheetRow icon="archive" title="Archive" onPress={onMenuArchive} />
            )}
            {convId && (
              <SheetRow
                icon="trash-2"
                title="Delete"
                onPress={onMenuDelete}
                destructive
                last
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 *  SheetRow
 * ------------------------------------------------------------------ */

function SheetRow({
  icon,
  title,
  sub,
  onPress,
  last,
  destructive,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  sub?: string;
  onPress: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.sheetRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
        },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View
        style={[
          styles.sheetIcon,
          {
            backgroundColor: destructive ? c.danger + '15' : c.surfaceAlt,
          },
        ]}
      >
        <Feather
          name={icon}
          size={16}
          color={destructive ? c.danger : c.text}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          variant="bodyStrong"
          style={destructive ? { color: c.danger } : undefined}
        >
          {title}
        </Text>
        {sub && (
          <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
            {sub}
          </Text>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={c.textFaint} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 *  Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: spacing['2xl'],
  },
  scrollFab: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  composerInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderRadius: radii['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 50,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    paddingVertical: spacing.sm,
    padding: 0,
    margin: 0,
    maxHeight: 120,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachScroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,15,8,0.45)',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  sheet: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});