import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import {
  messagingApi,
  type ChatMessage,
  type ConversationItem,
} from '../../api/messaging.api';
import { chatSocketService } from '../../services/chat-socket.service';
import TypingDots from './TypingDots';

type ThreadRoute = RouteProp<RootStackParamList, 'ChatThread'>;

const PAGE_SIZE = 30;
const TYPING_IDLE_MS = 1800;

function clockOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function newClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One booking thread. History comes from REST and the socket only carries
 * deltas, so a dropped connection costs a refresh, never a gap.
 *
 * The list is inverted: state holds newest-first, which is what makes "scroll up
 * for older" a plain onEndReached instead of a scroll-offset correction.
 */
export default function ChatThreadScreen() {
  const navigation = useNavigation();
  const route = useRoute<ThreadRoute>();
  const { conversationId, counterpartName, serviceName } = route.params;
  const myId = useAuthStore((state) => state.user?.id);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationItem | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);

  const typingSentAt = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSend = conversation?.canSend ?? true;

  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex(
        (m) =>
          m.id === incoming.id ||
          (!!incoming.clientMessageId &&
            m.clientMessageId === incoming.clientMessageId),
      );
      if (index === -1) return [incoming, ...prev];
      const next = [...prev];
      next[index] = incoming;
      return next;
    });
  }, []);

  // ------------------------------------------------------------ initial load

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, page] = await Promise.all([
          messagingApi.getConversation(conversationId),
          messagingApi.listMessages(conversationId, { limit: PAGE_SIZE }),
        ]);
        if (cancelled) return;
        setConversation(meta);
        setMessages([...page.data].reverse());
        setNextBefore(page.nextBefore);
        await messagingApi.markRead(conversationId);
      } catch {
        if (!cancelled) {
          Alert.alert('Không mở được cuộc trò chuyện', 'Vui lòng thử lại sau.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // --------------------------------------------------------------- realtime

  useEffect(() => {
    void chatSocketService.connect().then(() => {
      chatSocketService.joinConversation(conversationId);
    });

    const unsubscribe = chatSocketService.subscribe({
      onMessageNew: (message) => {
        if (message.conversationId !== conversationId) return;
        upsert(message);
        if (message.senderId !== myId) {
          setPeerTyping(false);
          void messagingApi.markRead(conversationId).catch(() => undefined);
        }
      },
      onMessageUpdated: (message) => {
        if (message.conversationId === conversationId) upsert(message);
      },
      onMessageDeleted: (message) => {
        if (message.conversationId === conversationId) upsert(message);
      },
      onTyping: (event) => {
        if (event.conversationId !== conversationId || event.userId === myId) return;
        setPeerTyping(event.isTyping);
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
        if (event.isTyping) {
          // Guard against a lost "stopped typing" leaving the dots on forever.
          peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 6000);
        }
      },
    });

    return () => {
      unsubscribe();
      chatSocketService.leaveConversation(conversationId);
      if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    };
  }, [conversationId, myId, upsert]);

  // ----------------------------------------------------------- older history

  const loadOlder = useCallback(async () => {
    if (!nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await messagingApi.listMessages(conversationId, {
        limit: PAGE_SIZE,
        before: nextBefore,
      });
      setMessages((prev) => [...prev, ...[...page.data].reverse()]);
      setNextBefore(page.nextBefore);
    } catch {
      // Keep what is already on screen; the user can pull again.
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, nextBefore, loadingOlder]);

  // ------------------------------------------------------------------ typing

  const onChangeDraft = useCallback(
    (text: string) => {
      setDraft(text);
      if (!canSend) return;

      const now = Date.now();
      if (now - typingSentAt.current > 1500) {
        typingSentAt.current = now;
        chatSocketService.sendTyping(conversationId, true);
      }
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => {
        typingSentAt.current = 0;
        chatSocketService.sendTyping(conversationId, false);
      }, TYPING_IDLE_MS);
    },
    [canSend, conversationId],
  );

  // ----------------------------------------------------------------- actions

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending || !canSend) return;

    if (editing) {
      setSending(true);
      try {
        const updated = await messagingApi.editMessage(editing.id, content);
        upsert(updated);
        setEditing(null);
        setDraft('');
      } catch {
        Alert.alert('Không sửa được tin nhắn', 'Vui lòng thử lại.');
      } finally {
        setSending(false);
      }
      return;
    }

    const clientMessageId = newClientMessageId();
    // Optimistic bubble; the server echoes clientMessageId so it is replaced,
    // not duplicated, when the real row comes back.
    const optimistic: ChatMessage = {
      id: `local-${clientMessageId}`,
      conversationId,
      senderId: myId ?? '',
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      isDeleted: false,
      clientMessageId,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setDraft('');
    setSending(true);
    chatSocketService.sendTyping(conversationId, false);

    try {
      const saved = await messagingApi.sendMessage(
        conversationId,
        content,
        clientMessageId,
      );
      upsert(saved);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(content);
      Alert.alert('Không gửi được', 'Kiểm tra kết nối rồi thử lại.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, canSend, editing, conversationId, myId, upsert]);

  const handleDelete = useCallback(
    async (message: ChatMessage) => {
      try {
        const updated = await messagingApi.deleteMessage(message.id);
        upsert(updated);
      } catch {
        Alert.alert('Không gỡ được tin nhắn', 'Vui lòng thử lại.');
      }
    },
    [upsert],
  );

  const openActions = useCallback(
    (message: ChatMessage) => {
      if (message.senderId !== myId || message.isDeleted || !canSend) return;
      if (message.id.startsWith('local-')) return;
      setActionTarget(message);
    },
    [myId, canSend],
  );

  // ---------------------------------------------------------------- rendering

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const mine = item.senderId === myId;
      return (
        <Pressable
          onLongPress={() => openActions(item)}
          delayLongPress={300}
          style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}
        >
          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              item.isDeleted && styles.bubbleDeleted,
            ]}
          >
            <Text
              style={[
                styles.msgText,
                mine ? styles.msgTextMine : styles.msgTextTheirs,
                item.isDeleted && styles.msgTextDeleted,
              ]}
            >
              {item.isDeleted ? 'Tin nhắn đã được gỡ' : item.content}
            </Text>
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, mine && styles.metaTextMine]}>
                {clockOf(item.createdAt)}
              </Text>
              {!!item.editedAt && !item.isDeleted && (
                <Text style={[styles.metaText, mine && styles.metaTextMine]}>
                  {' · đã sửa'}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [myId, openActions],
  );

  const headerSubtitle = useMemo(
    () => conversation?.serviceName ?? serviceName ?? null,
    [conversation, serviceName],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversation?.counterpart.fullName ?? counterpartName}
          </Text>
          {!!headerSubtitle && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          )}
        </View>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.chatContent}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            keyboardDismissMode="interactive"
            removeClippedSubviews
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={11}
            ListHeaderComponent={peerTyping ? <TypingDots /> : null}
            ListFooterComponent={
              loadingOlder ? (
                <ActivityIndicator style={styles.olderSpinner} color="#94A3B8" />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  Hãy gửi tin nhắn đầu tiên để trao đổi về công việc.
                </Text>
              </View>
            }
          />
        )}

        {!!editing && (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color="#2563EB" />
            <Text style={styles.editBannerText} numberOfLines={1}>
              Đang sửa: {editing.content}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setEditing(null);
                setDraft('');
              }}
            >
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {canSend ? (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Nhập tin nhắn..."
              value={draft}
              onChangeText={onChangeDraft}
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              activeOpacity={0.7}
            >
              <Ionicons name={editing ? 'checkmark' : 'send'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.readOnlyBar}>
            <Ionicons name="lock-closed-outline" size={16} color="#94A3B8" />
            <Text style={styles.readOnlyText}>
              Cuộc trò chuyện này chỉ còn xem lại được.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        transparent
        visible={!!actionTarget}
        animationType="fade"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionTarget(null)}>
          <View style={styles.sheet}>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => {
                const target = actionTarget;
                setActionTarget(null);
                if (!target) return;
                setEditing(target);
                setDraft(target.content);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#0F172A" />
              <Text style={styles.sheetText}>Sửa tin nhắn</Text>
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => {
                const target = actionTarget;
                setActionTarget(null);
                if (!target) return;
                Alert.alert('Gỡ tin nhắn', 'Tin nhắn sẽ bị gỡ với cả hai bên.', [
                  { text: 'Huỷ', style: 'cancel' },
                  {
                    text: 'Gỡ',
                    style: 'destructive',
                    onPress: () => void handleDelete(target),
                  },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.sheetText, styles.sheetTextDanger]}>Gỡ tin nhắn</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    transform: [{ scaleY: -1 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSubtitle: { fontSize: 12, color: '#2563EB', marginTop: 1 },
  chatContent: { paddingVertical: 12, flexGrow: 1 },
  olderSpinner: { marginVertical: 12 },

  msgRow: { paddingHorizontal: 12, marginVertical: 3, flexDirection: 'row' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleDeleted: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', borderWidth: 1 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTextMine: { color: '#FFFFFF' },
  msgTextTheirs: { color: '#0F172A' },
  msgTextDeleted: { color: '#94A3B8', fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 3 },
  metaText: { fontSize: 10, color: '#94A3B8' },
  metaTextMine: { color: '#BFDBFE' },

  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
  },
  editBannerText: { flex: 1, fontSize: 13, color: '#1D4ED8' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 21,
    backgroundColor: '#F1F5F9',
    fontSize: 15,
    color: '#0F172A',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: '#CBD5E1' },

  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#F1F5F9',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  readOnlyText: { fontSize: 13, color: '#64748B' },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
    paddingTop: 8,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  sheetDivider: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 22 },
  sheetText: { fontSize: 16, color: '#0F172A' },
  sheetTextDanger: { color: '#EF4444' },
});
