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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { messagingApi, type ConversationItem } from '../../api/messaging.api';
import { useAppTheme } from '../../constants/theme';
import { chatSocketService } from '../../services/chat-socket.service';

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
  return new Date(iso).toLocaleDateString('vi-VN');
}
export default function ChatListScreen() {
  const { colors, isDark } = useAppTheme();
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
      onPress={() =>
        navigation.navigate('ChatThread', {
          conversationId: item.id,
          counterpartName: item.counterpart.fullName,
          serviceName: item.serviceName ?? undefined,
        })
      }
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="create-outline" size={24} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput 
            style={styles.searchInput}
            placeholder="Tìm kiếm"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
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
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor="#3B82F6" />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={56} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Chưa có cuộc trò chuyện nào</Text>
              <Text style={styles.emptyText}>
                {error ??
                  'Cuộc trò chuyện sẽ mở ra sau khi bạn đặt lịch và thợ nhận được yêu cầu.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerBtn: {
    width: 60,
    alignItems: 'center',
  },
  headerBtnText: {
    color: '#2563EB',
    fontSize: 17,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#0F172A',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listContent: { paddingVertical: 0 },
  emptyWrap: { flexGrow: 1 },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  avatarFallback: {
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#2563EB' },
  rowBody: { 
    flex: 1, 
    justifyContent: 'center',
    paddingBottom: 4,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
  time: { fontSize: 13, color: '#94A3B8', marginLeft: 8 },
  serviceNote: { fontSize: 13, color: '#2563EB', marginTop: 2 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  preview: { flex: 1, fontSize: 14, color: '#64748B' },
  previewUnread: { color: '#0F172A', fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  readOnlyTag: { marginTop: 4, fontSize: 12, color: '#F59E0B' },
});
