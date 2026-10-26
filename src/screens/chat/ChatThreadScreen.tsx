import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import ChatAttachmentView from './ChatAttachmentView';
import { AttachmentProblem, pickChatAttachment, sendChatAttachment, type PickedAttachment, type PickSource } from './chat-attachment';
import { uploadErrorText } from '../../services/upload-retry';
import { useAuthStore } from '../../store/auth.store';
import { isCallBusy, useCallStore } from '../../store/call.store';
import {
  isConversationClosedError,
  messagingApi,
  type ChatMessage,
  type ConversationItem,
} from '../../api/messaging.api';
import { chatSocketService } from '../../services/chat-socket.service';
import TypingDots from './TypingDots';
import { useAppTheme } from '../../constants/theme';
import { vnTimeString } from '../../utils/vn-time';
import BackButton from '../../components/BackButton';

type ThreadRoute = RouteProp<RootStackParamList, 'ChatThread'>;

const PAGE_SIZE = 30;
const TYPING_IDLE_MS = 1800;

function clockOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return vnTimeString(date, { hour: '2-digit', minute: '2-digit' });
}

function newClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


export default function ChatThreadScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const route = useRoute<ThreadRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversationId, counterpartName, serviceName } = route.params;
  const myId = useAuthStore((state) => state.user?.id);
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationItem | null>(null);

  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  const typingSentAt = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fail closed until the backend confirms permission for this job-scoped chat.
  const canSend = conversation?.canSend === true;
  // PO 18/10/2026: a finished order closes the chat until a warranty claim reopens it.
  const closedByCompletion = !canSend && conversation?.closedReason === 'order_completed';
  const viewerIsCustomer = String(conversation?.counterpart.role ?? '').toUpperCase() === 'TECHNICIAN';

  const callStatus = useCallStore((state) => state.status);
  const callBusy = isCallBusy(callStatus);
  const startVoiceCall = useCallback(() => {
    Haptics.selectionAsync();
    void useCallStore.getState().startCall(conversationId, {
      name: conversation?.counterpart.fullName ?? counterpartName,
      role: String(conversation?.counterpart.role ?? '').toUpperCase() === 'TECHNICIAN' ? 'Kỹ thuật viên' : 'Khách hàng',
    });
  }, [conversation, conversationId, counterpartName]);

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

  const [reloadKey, setReloadKey] = useState(0);

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
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey]);

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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      if (isConversationClosedError(error)) {
        Alert.alert('Cuộc trò chuyện đã khoá', 'Đơn đã hoàn tất nên không nhắn thêm được.');
        void messagingApi.getConversation(conversationId).then(setConversation).catch(() => undefined);
      } else {
        Alert.alert('Không gửi được tin nhắn', 'Vui lòng kiểm tra kết nối và thử lại.');
      }
      setDraft(content);
    } finally {
      setSending(false);
    }
  }, [draft, sending, canSend, editing, conversationId, myId, upsert]);

  // ------------------------------------------------- photo / video (PO 18/10/2026)

  const attachments = useRef(new Map<string, { picked: PickedAttachment; caption: string; controller: AbortController }>());
  useEffect(() => {
    const pending = attachments.current;
    return () => pending.forEach((entry) => entry.controller.abort());
  }, []);

  const patchUpload = useCallback((clientMessageId: string, upload: ChatMessage['upload'] | undefined) => {
    setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, upload } : m)));
  }, []);

  const runAttachment = useCallback(async (clientMessageId: string) => {
    const entry = attachments.current.get(clientMessageId);
    if (!entry) return;
    const controller = new AbortController();
    entry.controller = controller;
    patchUpload(clientMessageId, { state: 'preparing', progress: 0 });
    try {
      const saved = await sendChatAttachment(conversationId, entry.picked, {
        caption: entry.caption,
        clientMessageId,
        signal: controller.signal,
        onPhase: (phase) => patchUpload(clientMessageId, { state: phase, progress: 0 }),
        onProgress: (fraction) => setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId && m.upload
          ? { ...m, upload: { ...m.upload, progress: fraction } } : m))),
      });
      attachments.current.delete(clientMessageId);
      upsert(saved);
    } catch (error) {
      if (controller.signal.aborted) return;
      const closed = isConversationClosedError(error);
      patchUpload(clientMessageId, {
        state: 'failed',
        progress: 0,
        error: closed ? 'Đơn đã hoàn tất nên cuộc trò chuyện đã khoá.' : error instanceof AttachmentProblem ? error.message : uploadErrorText(error),
      });
      if (closed) void messagingApi.getConversation(conversationId).then(setConversation).catch(() => undefined);
    }
  }, [conversationId, patchUpload, upsert]);

  const startAttachment = useCallback((picked: PickedAttachment) => {
    const caption = draft.trim();
    const clientMessageId = newClientMessageId();
    attachments.current.set(clientMessageId, { picked, caption, controller: new AbortController() });
    const optimistic: ChatMessage = {
      id: `local-${clientMessageId}`,
      conversationId,
      senderId: myId ?? '',
      content: caption,
      createdAt: new Date().toISOString(),
      editedAt: null,
      isDeleted: false,
      clientMessageId,
      attachment: { kind: picked.kind, mimeType: picked.type, sizeBytes: picked.sizeBytes },
      localUri: picked.uri,
      upload: { state: 'preparing', progress: 0 },
    };
    setMessages((prev) => [optimistic, ...prev]);
    setDraft('');
    void runAttachment(clientMessageId);
  }, [draft, conversationId, myId, runAttachment]);

  const discardAttachment = useCallback((clientMessageId: string) => {
    attachments.current.get(clientMessageId)?.controller.abort();
    attachments.current.delete(clientMessageId);
    setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
  }, []);

  const choosePick = useCallback(async (source: PickSource) => {
    try {
      const { picked, problem } = await pickChatAttachment(source);
      if (problem) Alert.alert('Chưa gửi được', problem);
      else if (picked) startAttachment(picked);
    } catch {
      Alert.alert('Chưa gửi được', 'Không mở được thư viện hoặc camera. Vui lòng thử lại.');
    }
  }, [startAttachment]);

  const openAttachMenu = useCallback(() => {
    Haptics.selectionAsync();
    Alert.alert('Gửi ảnh hoặc video', 'Chọn nguồn. Ảnh tối đa 10 MB, video tối đa 60 giây.', [
      { text: 'Thư viện', onPress: () => void choosePick('library') },
      { text: 'Chụp ảnh', onPress: () => void choosePick('camera-photo') },
      { text: 'Quay video', onPress: () => void choosePick('camera-video') },
    ]);
  }, [choosePick]);



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
          {!!item.attachment && !item.isDeleted && (
            <ChatAttachmentView
              messageId={item.id}
              attachment={item.attachment}
              localUri={item.localUri}
              textColor={mine ? '#FFFFFF' : colors.text}
            />
          )}
          {!!item.upload && (
            <View style={styles.uploadRow} testID={`chat-upload-${item.clientMessageId}`}>
              <Text style={[styles.metaText, mine ? styles.metaTextMine : styles.metaTextTheirs]} accessibilityLiveRegion="polite">
                {item.upload.state === 'preparing' ? 'Đang nén…'
                  : item.upload.state === 'uploading' ? `Đang gửi ${Math.round(item.upload.progress * 100)}%`
                  : (item.upload.error ?? 'Chưa gửi được.')}
              </Text>
              {item.upload.state === 'failed' && !!item.clientMessageId && (
                <View style={styles.uploadActions}>
                  <TouchableOpacity accessibilityRole="button" style={styles.uploadBtn} onPress={() => void runAttachment(item.clientMessageId!)}>
                    <Text style={styles.uploadBtnText}>Thử lại</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" style={styles.uploadBtn} onPress={() => discardAttachment(item.clientMessageId!)}>
                    <Text style={styles.uploadBtnText}>Bỏ</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {(!!item.content || item.isDeleted || !item.attachment) && (
            <Text
              style={[
                styles.msgText,
                mine ? styles.msgTextMine : styles.msgTextTheirs,
                item.isDeleted && styles.msgTextDeleted,
              ]}
            >
              {item.isDeleted ? 'Tin nhắn đã được gỡ' : item.content}
            </Text>
          )}
          <View style={styles.metaRow}>
            {!!item.isAutomated && !item.isDeleted && (
              <Text
                testID="message-automated"
                style={[styles.metaText, mine ? styles.metaTextMine : styles.metaTextTheirs]}
              >
                {'Tin nhắn tự động · '}
              </Text>
            )}
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
    [myId, styles, colors.text, runAttachment, discardAttachment],
  );

  const headerSubtitle = useMemo(
    () => [conversation?.serviceName ?? serviceName ?? null, conversation?.orderCode ?? null].filter(Boolean).join(' · ') || null,
    [conversation, serviceName],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />

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

        {/* Voice call (PO 18/10/2026): only where the server lets this person write. */}
        {canSend && (
          <TouchableOpacity
            testID="chat-call"
            style={[styles.headerCallBtn, callBusy && { opacity: 0.4 }]}
            disabled={callBusy}
            onPress={startVoiceCall}
            accessibilityRole="button"
            accessibilityLabel={callBusy ? 'Đang có cuộc gọi khác' : 'Gọi thoại'}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="call-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Same reason as the assistant screen: KeyboardAvoidingView needs the
          window to resize on Android, and edge-to-edge does not resize it. */}
      <View style={[styles.flex, { paddingBottom: keyboardInset }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Đang tải…</Text>
          </View>
        ) : loadFailed && messages.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.loadErrorTitle}>Không tải được cuộc trò chuyện</Text>
            <Text style={styles.loadErrorText}>
              Vui lòng kiểm tra kết nối rồi thử lại.
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, styles.loadErrorRetryBtn]}
              onPress={() => {
                setLoadFailed(false);
                setLoading(true);
                setReloadKey((key) => key + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Thử tải lại cuộc trò chuyện"
              activeOpacity={0.7}
            >
              <Text style={styles.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
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
                <ActivityIndicator style={styles.olderSpinner} color={colors.muted} />
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
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.editBannerText} numberOfLines={1}>
              Đang sửa: {editing.content}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setEditing(null);
                setDraft('');
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Huỷ sửa tin nhắn"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {canSend ? (
          <View style={[styles.inputContainer, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 5) }]}>
            {!editing && (
              <TouchableOpacity
                testID="chat-attach"
                style={styles.sendIconBtn}
                onPress={openAttachMenu}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Gửi ảnh hoặc video"
              >
                <Ionicons name="attach" size={24} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TextInput
              style={styles.input}
              placeholder="Tin nhắn..."
              value={draft}
              onChangeText={onChangeDraft}
              placeholderTextColor={colors.muted}
              accessibilityLabel="Nhập tin nhắn"
              multiline
              maxLength={2000}
            />
            
            <TouchableOpacity
              style={styles.sendIconBtn}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Lưu chỉnh sửa' : 'Gửi tin nhắn'}
            >
              <Ionicons
                name={editing ? 'checkmark' : 'send'}
                size={22}
                color={draft.trim() ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.readOnlyBar, { paddingBottom: Math.max(insets.bottom, 16) }]} testID={closedByCompletion ? 'chat-closed-completed' : undefined}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.readOnlyText}>
              {conversation === null
                ? (loadFailed
                  ? 'Chưa xác minh được quyền nhắn tin. Vui lòng thử lại.'
                  : 'Đang xác minh quyền nhắn tin…')
                : closedByCompletion
                  ? (viewerIsCustomer
                    ? 'Đơn đã hoàn tất nên cuộc trò chuyện đã khoá. Nếu thiết bị gặp lại vấn đề, hãy gửi yêu cầu bảo hành để nhắn tin lại với kỹ thuật viên.'
                    : 'Đơn đã hoàn tất nên cuộc trò chuyện đã khoá. Khi khách gửi yêu cầu bảo hành, cuộc trò chuyện sẽ mở lại.')
                  : 'Cuộc trò chuyện này chỉ còn xem lại được.'}
            </Text>
            {closedByCompletion && viewerIsCustomer && !!conversation?.serviceOrderId && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Gửi yêu cầu bảo hành"
                style={styles.warrantyBtn}
                onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: conversation.serviceOrderId!, screen: 'CustomerWarranty' })}
              >
                <Text style={styles.warrantyBtnText}>Gửi yêu cầu bảo hành</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  loadErrorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  loadErrorText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  loadErrorRetryBtn: { marginTop: 16 },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    transform: [{ scaleY: -1 }],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 8 },
  headerAvatarFallback: {
    width: 38, height: 38, borderRadius: 19, marginRight: 8,
    backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center'
  },
  headerAvatarText: { color: colors.primaryStrong, fontSize: 16, fontWeight: 'bold' },
  headerTextWrap: { flex: 1, justifyContent: 'center' },
  headerCallBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },

  chatContent: { paddingVertical: 12, flexGrow: 1 },
  olderSpinner: { marginVertical: 12 },

  msgRow: { paddingHorizontal: 12, marginVertical: 4 },
  msgRowMine: { alignItems: 'flex-end' },
  msgRowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMine: {
    backgroundColor: colors.primaryStrong,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  bubbleDeleted: { backgroundColor: colors.divider, borderColor: colors.border, borderWidth: 1, borderRadius: 16 },
  msgText: { fontSize: 16, lineHeight: 24 },
  msgTextMine: { color: colors.surface },
  msgTextTheirs: { color: colors.text },
  msgTextDeleted: { color: colors.muted, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 4 },
  metaText: { fontSize: 12 },
  metaTextMine: { color: colors.surface },
  metaTextTheirs: { color: colors.muted },

  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: colors.primaryTint,
  },
  editBannerText: { flex: 1, fontSize: 13, color: colors.primaryDark },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 21,
    backgroundColor: colors.divider,
    fontSize: 16,
    color: colors.text,
    marginHorizontal: 4,
  },
  sendIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },

  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.divider,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readOnlyText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, flexShrink: 1 },
  warrantyBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  warrantyBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  uploadRow: { gap: 4, marginBottom: 4 },
  uploadActions: { flexDirection: 'row', gap: 12 },
  uploadBtn: { minHeight: 44, justifyContent: 'center' },
  uploadBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
