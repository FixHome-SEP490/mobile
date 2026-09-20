import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
//import { Menu, MenuOptions, MenuOption, MenuTrigger } from 'react-native-popup-menu';
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

import { useAppTheme } from '../../constants/theme';

export default function ChatThreadScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute<ThreadRoute>();
  const { conversationId, counterpartName, serviceName } = route.params;
  const myId = useAuthStore((state) => state.user?.id);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationItem | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  const typingSentAt = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Gorhom Bottom Sheet Refs
  const attachmentSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['30%', '50%'], []);

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
          peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 6000);
        }
      },
      onReconnected: () => {
        void messagingApi
          .listMessages(conversationId, { limit: PAGE_SIZE })
          .then((page) => page.data.forEach(upsert))
          .catch(() => undefined);
      },
    });

    return () => {
      unsubscribe();
      chatSocketService.forgetConversation(conversationId);
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
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      Alert.alert('Không gửi được tin nhắn', 'Vui lòng kiểm tra kết nối và thử lại.');
      setDraft(content);
    } finally {
      setSending(false);
    }
  }, [draft, sending, canSend, editing, conversationId, myId, upsert]);



  // Action menu is handled by react-native-popup-menu inline

  const openAttachmentMenu = useCallback(() => {
    attachmentSheetRef.current?.present();
  }, []);

  // ----------------------------------------------------------------- render

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const mine = item.senderId === myId;
      const content = (
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
            <Text style={[styles.metaText, mine ? styles.metaTextMine : styles.metaTextTheirs]}>
              {clockOf(item.createdAt)}
            </Text>
            {!!item.editedAt && !item.isDeleted && (
              <Text style={[styles.metaText, mine ? styles.metaTextMine : styles.metaTextTheirs]}>
                {' · đã sửa'}
              </Text>
            )}
          </View>
        </View>
      );

      return (
        <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
          {mine && !item.isDeleted ? (
            /*<Menu>
              <MenuTrigger triggerOnLongPress={true}>
                {content}
              </MenuTrigger>
              <MenuOptions customStyles={{ optionsContainer: styles.menuOptionsContainer }}>
                <MenuOption onSelect={() => { setEditing(item); setDraft(item.content); }}>
                  <View style={styles.menuOptionRow}>
                    <Ionicons name="create-outline" size={18} color="#0F172A" />
                    <Text style={styles.menuOptionText}>Sửa tin nhắn</Text>
                  </View>
                </MenuOption>
                <MenuOption onSelect={() => {
                  Alert.alert('Gỡ tin nhắn', 'Tin nhắn sẽ bị gỡ với cả hai bên.', [
                    { text: 'Huỷ', style: 'cancel' },
                    { text: 'Gỡ', style: 'destructive', onPress: () => void handleDelete(item) },
                  ]);
                }}>
                  <View style={styles.menuOptionRow}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.menuOptionText, { color: '#EF4444' }]}>Gỡ tin nhắn</Text>
                  </View>
                </MenuOption>
              </MenuOptions>
            </Menu>*/
            content
          ) : (
            content
          )}
        </View>
      );
    },
    [myId],
  );

  const headerSubtitle = useMemo(
    () => conversation?.serviceName ?? serviceName ?? null,
    [conversation, serviceName],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerProfile}>
          {conversation?.counterpart.avatarUrl ? (
             <Image source={{ uri: conversation.counterpart.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
               <Text style={styles.headerAvatarText}>{counterpartName[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
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
        </View>

        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
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
                <ActivityIndicator style={styles.olderSpinner} color="#8E8E93" />
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
            <Ionicons name="create-outline" size={16} color="#3B82F6" />
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
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TouchableOpacity style={styles.attachBtn} onPress={openAttachmentMenu}>
              <Ionicons name="attach" size={26} color="#64748B" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Tin nhắn..."
              value={draft}
              onChangeText={onChangeDraft}
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
            />
            
            <TouchableOpacity
              style={styles.sendIconBtn}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={editing ? 'checkmark' : (draft.trim() ? 'send' : 'mic')} 
                size={22} 
                color={draft.trim() ? '#3B82F6' : '#64748B'} 
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.readOnlyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
            <Text style={styles.readOnlyText}>
              Cuộc trò chuyện này chỉ còn xem lại được.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Attachment Menu Dummy */}
      <BottomSheetModal
        ref={attachmentSheetRef}
        snapPoints={snapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={styles.sheet}>
          <View style={styles.attachmentGrid}>
            <TouchableOpacity style={styles.attachOption}>
              <View style={[styles.attachIconBg, { backgroundColor: '#3B82F6' }]}>
                 <Ionicons name="image" size={24} color="#FFF" />
              </View>
              <Text style={styles.attachOptionText}>Thư viện</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption}>
              <View style={[styles.attachIconBg, { backgroundColor: '#10B981' }]}>
                 <Ionicons name="document-text" size={24} color="#FFF" />
              </View>
              <Text style={styles.attachOptionText}>Tài liệu</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachOption}>
              <View style={[styles.attachIconBg, { backgroundColor: '#F59E0B' }]}>
                 <Ionicons name="location" size={24} color="#FFF" />
              </View>
              <Text style={styles.attachOptionText}>Vị trí</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
  headerAvatarFallback: {
    width: 38, height: 38, borderRadius: 19, marginRight: 10,
    backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center'
  },
  headerAvatarText: { color: '#2563EB', fontSize: 16, fontWeight: 'bold' },
  headerTextWrap: { flex: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSubtitle: { fontSize: 13, color: '#64748B', marginTop: 1 },
  
  chatContent: { paddingVertical: 12, flexGrow: 1 },
  olderSpinner: { marginVertical: 12 },

  msgRow: { paddingHorizontal: 12, marginVertical: 4 },
  msgRowMine: { alignItems: 'flex-end' },
  msgRowTheirs: { alignItems: 'flex-start' },
  bubble: { 
    maxWidth: '80%', 
    paddingHorizontal: 14, 
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMine: { 
    backgroundColor: '#3B82F6', 
    borderBottomRightRadius: 4,
  }, 
  bubbleTheirs: { 
    backgroundColor: '#FFFFFF', 
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0' 
  }, 
  bubbleDeleted: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 16 },
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextMine: { color: '#FFFFFF' },
  msgTextTheirs: { color: '#0F172A' },
  msgTextDeleted: { color: '#94A3B8', fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 4 },
  metaText: { fontSize: 11 },
  metaTextMine: { color: 'rgba(255,255,255,0.7)' },
  metaTextTheirs: { color: '#94A3B8' },

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
  attachBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: 4,
  },
  sendIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
  },

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

  sheet: {
    backgroundColor: '#FFFFFF',
    flex: 1,
    paddingBottom: 20,
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
  
  attachmentGrid: {
    flexDirection: 'row',
    padding: 24,
    gap: 24,
  },
  attachOption: {
    alignItems: 'center',
    width: 64,
  },
  attachIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  attachOptionText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  
  menuOptionsContainer: {
    borderRadius: 12,
    paddingVertical: 4,
    width: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuOptionText: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  }
});
