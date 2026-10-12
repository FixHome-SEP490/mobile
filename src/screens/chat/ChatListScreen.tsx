import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { messagingApi, type ConversationItem } from '../../api/messaging.api';
import { useAppTheme } from '../../constants/theme';
import { chatSocketService } from '../../services/chat-socket.service';
import { vnDateString } from '../../utils/vn-time';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts[parts.length - 1][0].toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày`;
  return vnDateString(iso);
}
export default function ChatListScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<Nav>();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const data = await messagingApi.listConversations();
      setConversations(data);
      setError(null);
    } catch {
      setError('Không tải được danh sách tin nhắn. Kéo xuống để thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void chatSocketService.connect();
    const unsubscribe = chatSocketService.subscribe({
      onConversationUpdated: () => {
        void load();
      },
    });
    return unsubscribe;
  }, [load]);

  const filteredConversations = conversations.filter((c) =>
    c.counterpart.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: ConversationItem }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Cuộc trò chuyện với ${item.counterpart.fullName}`}
      accessibilityHint="Mở cuộc trò chuyện để xem tin nhắn"
      onPress={() => {
        Haptics.selectionAsync();
        navigation.navigate('ChatThread', {
          conversationId: item.id,
          counterpartName: item.counterpart.fullName,
          serviceName: item.serviceName ?? undefined,
        });
      }}
    >
      {item.counterpart.avatarUrl ? (
        <Image source={{ uri: item.counterpart.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarText}>{initialsOf(item.counterpart.fullName)}</Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {item.counterpart.fullName}
          </Text>
          <Text style={styles.time}>{relativeTime(item.lastMessageAt)}</Text>
        </View>

        {!!item.serviceName && (
          <Text style={styles.serviceNote} numberOfLines={1}>
            {item.serviceName}
          </Text>
        )}

        <View style={styles.rowBottom}>
          <Text
            style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {item.lastMessagePreview ?? 'Chưa có tin nhắn nào'}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>

        {!item.canSend && (
          <Text style={styles.readOnlyTag}>Chỉ xem lại — đơn đã có thợ khác</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header: conversations open only from a received or active job,
          so there is no compose action here. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Tin nhắn</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm tin nhắn"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Tìm kiếm tin nhắn"
            returnKeyType="search"
          />
        </View>
      </View>

      {!!error && !loading && conversations.length > 0 && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {error}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => load('refresh')}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại danh sách tin nhắn"
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={
            filteredConversations.length === 0 ? styles.emptyWrap : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={56} color={colors.muted} />
              <Text style={styles.emptyTitle}>Chưa có cuộc trò chuyện nào</Text>
              <Text style={styles.emptyText}>
                {error ??
                  'Cuộc trò chuyện sẽ mở ra sau khi bạn đặt lịch và thợ nhận được yêu cầu.'}
              </Text>
              {!!error && (
                <TouchableOpacity
                  style={[styles.retryBtn, styles.emptyRetryBtn]}
                  onPress={() => load('refresh')}
                  accessibilityRole="button"
                  accessibilityLabel="Thử tải lại danh sách tin nhắn"
                  activeOpacity={0.7}
                >
                  <Text style={styles.retryBtnText}>Thử lại</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.divider,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.tone.danger.bg,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.tone.danger.text,
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
  emptyRetryBtn: { marginTop: 16 },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listContent: { paddingVertical: 4, paddingBottom: 16 },
  emptyWrap: { flexGrow: 1 },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarFallback: {
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: colors.primaryStrong },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 4,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  time: { fontSize: 13, color: colors.muted, marginLeft: 8 },
  serviceNote: { fontSize: 13, color: colors.primaryStrong, marginTop: 2 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  preview: { flex: 1, fontSize: 14, color: colors.textSecondary },
  previewUnread: { color: colors.text, fontWeight: '600' },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  readOnlyTag: { marginTop: 4, fontSize: 12, color: colors.tone.warning.text },
});
