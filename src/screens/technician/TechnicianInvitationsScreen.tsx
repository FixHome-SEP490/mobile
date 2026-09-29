// src/screens/technician/TechnicianInvitationsScreen.tsx
//
// Technician PENDING invitation inbox — P2.
// Shows only live PENDING invitations from GET /invitations/my.
// Privacy: only allowed preview fields (province/district/service/quantity/urgency/time) are rendered.
// Accept/Decline: single in-flight lock per invitation to prevent duplicate POST on tap or retry.
// On ACCEPT: offer the existing Technician area only after a real order id is returned.
// Ambiguous responses remain locked while GET reconciliation cannot resolve them.
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UserRole, type RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import { createInvitationInbox, initialInboxState, isActionable } from './invitation-inbox';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatUrgency(urgency: string): string {
  switch (urgency.toUpperCase()) {
    case 'EMERGENCY': return '🚨 Khẩn cấp';
    case 'HIGH':      return '🔴 Cao';
    case 'NORMAL':
    case 'MEDIUM':    return '🟡 Bình thường';
    case 'LOW':       return '🟢 Thấp';
    default:          return urgency;
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function TechnicianInvitationsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NavProp>();
  const [state, setState] = useState(initialInboxState);
  const controllerRef = useRef<ReturnType<typeof createInvitationInbox> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createInvitationInbox(bookingsApi, ordersApi, setState, (notice, isCurrent) => {
      Alert.alert(notice.title, notice.message, notice.orderId ? [
        {
          text: 'Xem đơn vừa nhận',
          onPress: () => {
            if (isCurrent()) {
              navigation.navigate('TechnicianOrderDetail', {
                serviceOrderId: notice.orderId!,
              });
            }
          },
        },
        { text: 'Để sau', style: 'cancel' },
      ] : undefined);
    }, {
      getUserId: () => {
        const session = useAuthStore.getState();
        return session.isAuthenticated && session.user?.role === UserRole.TECHNICIAN
          ? session.user.id : null;
      },
      subscribe: (listener) => useAuthStore.subscribe(listener),
    });
  }
  const controller = controllerRef.current;
  const { invitations, loading, refreshing, error, actionInFlight, acceptedOrderId, recoveryPending } = state;
  useFocusEffect(useCallback(() => {
    void controller.focus();
    return () => controller.blur();
  }, [controller]));
  const onRefresh = () => { void controller.load(); };
  const handleRespond = (inv: InvitationItem, action: 'ACCEPT' | 'DECLINE') => {
    Haptics.impactAsync(
      action === 'ACCEPT' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
    );
    void controller.respond(inv.id, action);
  };

  const renderItem = ({ item: inv }: { item: InvitationItem }) => {
    const actionable = isActionable(inv);
    const inFlight = actionInFlight[inv.id];
    const b = inv.booking;

    return (
      <View style={styles.card}>
        {/* Privacy: only allowlisted preview fields */}
        <View style={styles.cardHeader}>
          <View style={styles.serviceIconBox}>
            <Ionicons name="construct-outline" size={22} color={colors.primaryStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>{b?.serviceName ?? 'Dịch vụ sửa chữa'}</Text>
            {b?.province || b?.district ? (
              <Text style={styles.locationText}>
                📍 {[b.district, b.province].filter(Boolean).join(', ')}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          {b?.urgency ? (
            <Text style={styles.metaChip}>{formatUrgency(b.urgency)}</Text>
          ) : null}
          {b?.quantity != null ? (
            <Text style={styles.metaChip}>SL: {b.quantity}</Text>
          ) : null}
        </View>

        {(b?.preferredStartAt || b?.preferredEndAt) ? (
          <Text style={styles.timeText}>
            🕐 {formatTime(b?.preferredStartAt)} – {formatTime(b?.preferredEndAt)}
          </Text>
        ) : null}

        {!actionable && (
          <View style={styles.expiredBanner}>
            <Ionicons name="time-outline" size={14} color="#92400E" />
            <Text style={styles.expiredText}>Lời mời đã hết hạn</Text>
          </View>
        )}

        {!!inFlight && (
          <Text style={styles.timeText}>
            Đã gửi phản hồi. Nếu chờ lâu, kéo xuống để kiểm tra lại; lời mời tạm khóa để tránh gửi trùng.
          </Text>
        )}

        {/* Action buttons — guarded single in-flight per invitation */}
        {actionable && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnDecline, inFlight ? styles.btnDisabled : null]}
              disabled={!!inFlight}
              onPress={() => handleRespond(inv, 'DECLINE')}
              accessibilityLabel="Từ chối lời mời"
            >
              {inFlight === 'DECLINE' ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.btnDeclineText}>Từ chối</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAccept, inFlight ? styles.btnDisabled : null]}
              disabled={!!inFlight}
              onPress={() => handleRespond(inv, 'ACCEPT')}
              accessibilityLabel="Nhận lời mời"
            >
              {inFlight === 'ACCEPT' ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.btnAcceptText}>Nhận việc</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />


      {acceptedOrderId ? (
        <View style={styles.acceptedCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.acceptedTitle}>Đã xác minh đơn vừa nhận</Text>
            <Text style={styles.acceptedText}>
              Đây là đơn đang được giao cho tài khoản kỹ thuật viên hiện tại.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.acceptedButton}
            onPress={() =>
              navigation.navigate('TechnicianOrderDetail', {
                serviceOrderId: acceptedOrderId,
              })
            }
          >
            <Text style={styles.acceptedButtonText}>Xem đơn vừa nhận</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {recoveryPending ? (
        <View style={styles.recoveryBanner}>
          <Ionicons name="sync-outline" size={16} color="#92400E" />
          <Text style={styles.recoveryText}>
            Có phản hồi nhận việc chưa xác định. Không gửi lại; ứng dụng chỉ đối chiếu bằng danh sách Công việc.
          </Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lời mời chờ xác nhận</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Đang tải lời mời...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={invitations.length === 0 ? styles.emptyFlex : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="mail-open-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Không có lời mời nào</Text>
              <Text style={styles.emptyDesc}>
                Khi khách hàng gửi lời mời, bạn sẽ thấy ở đây. Kéo xuống để làm mới.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  acceptedCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 10,
  },
  acceptedTitle: { fontSize: 15, fontWeight: '700', color: '#065F46' },
  acceptedText: { fontSize: 13, color: '#047857', lineHeight: 19 },
  acceptedButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  acceptedButtonText: { color: colors.surface, fontWeight: '700' },
  recoveryBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  recoveryText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#92400E' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.primaryStrong,
    borderRadius: 8,
  },
  retryBtnText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyFlex: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  serviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 13,
    color: '#475569',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaChip: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: colors.divider,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  expiredText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  btnDecline: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeclineText: {
    color: colors.error,
    fontWeight: '700',
    fontSize: 14,
  },
  btnAccept: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAcceptText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
