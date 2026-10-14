import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { InvitationItem } from '../../../api/bookings.api';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors } from '../../../constants/theme';

export interface InvitationDecisionViewProps {
  invitation: InvitationItem;
  /** Frozen inbox actionability (PENDING + live server deadline). */
  actionable: boolean;
  /** Closed-state label for expired/answered invitations. */
  closedLabel: string;
  countdownLabel: string | null;
  countdownUrgent: boolean;
  inFlight: 'ACCEPT' | 'DECLINE' | null;
  onAccept: () => void;
  /** Called only after the separate explicit decline confirm below. */
  onDecline: () => void;
  /** Read-only: clears the focused view, never POSTs. */
  onBack: () => void;
  /** GET-only inbox reload. */
  onRefresh: () => void;
}

/**
 * T01 — bounded presenter for one invitation decision. Props-driven only:
 * no inbox controller, provider, or POST lives here. The existing
 * TechnicianInvitationsScreen owns the single durable inbox and passes its
 * callbacks in; Back/refresh never write.
 */
export default function InvitationDecisionView({
  invitation,
  actionable,
  closedLabel,
  countdownLabel,
  countdownUrgent,
  inFlight,
  onAccept,
  onDecline,
  onBack,
  onRefresh,
}: InvitationDecisionViewProps) {
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const booking = invitation.booking;
  const location = [booking?.district, booking?.province].filter(Boolean).join(', ');
  const disabled = !actionable || inFlight !== null;
  const busy = inFlight !== null;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text }}>Trước khi nhận việc</Text>
      <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>
        Bạn đang xem các thông tin cần để quyết định. Địa chỉ chi tiết và thông tin riêng của khách hàng chỉ mở sau khi nhận việc thành công.
      </Text>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.textSecondary }}>
          Khu vực được phép xem: <Text style={{ color: colors.text }}>{location || 'Chưa xác định'}</Text>
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.textSecondary }}>
          Hạn phản hồi:{' '}
          <Text style={{ color: colors.text }}>
            {invitation.expiresAt && Number.isFinite(Date.parse(invitation.expiresAt))
              ? vnDateTimeString(invitation.expiresAt)
              : 'Chưa xác định'}
          </Text>
          {countdownLabel ? (
            <Text style={{ color: countdownUrgent ? colors.error : colors.warning }}> · {countdownLabel}</Text>
          ) : null}
        </Text>
      </View>
      {!actionable && (
        <Text testID="invitation-closed" style={{ fontSize: 12, lineHeight: 18, color: colors.textSecondary }}>
          {closedLabel}. Bạn không thể phản hồi lời mời này.
        </Text>
      )}
      {inFlight && (
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.textSecondary }}>
          Đã gửi phản hồi. Nếu chờ lâu, hãy làm mới để kiểm tra; lời mời tạm khóa để tránh gửi trùng.
        </Text>
      )}
      {actionable && (
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            testID="invitation-accept"
            accessibilityRole="button"
            accessibilityLabel={`Nhận việc ${booking?.serviceName ?? ''}`}
            accessibilityState={{ disabled, busy: inFlight === 'ACCEPT' }}
            disabled={disabled}
            onPress={() => {
              if (!disabled) onAccept();
            }}
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: colors.primaryStrong,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.surface, fontWeight: '700', fontSize: 16, lineHeight: 24 }}>
              {inFlight === 'ACCEPT' ? 'Đang xác minh…' : 'Nhận việc'}
            </Text>
          </TouchableOpacity>
          {confirmingDecline ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>Bạn chắc chắn muốn từ chối lời mời này?</Text>
              <TouchableOpacity
                testID="invitation-decline-confirm"
                accessibilityRole="button"
                accessibilityLabel="Xác nhận từ chối lời mời"
                disabled={busy}
                onPress={() => {
                  setConfirmingDecline(false);
                  onDecline();
                }}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.error, fontWeight: '700', fontSize: 14, lineHeight: 20 }}>
                  {inFlight === 'DECLINE' ? 'Đang xác minh…' : 'Xác nhận từ chối'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="invitation-decline-cancel"
                accessibilityRole="button"
                accessibilityLabel="Giữ lại lời mời"
                onPress={() => setConfirmingDecline(false)}
                style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Giữ lại lời mời</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID="invitation-decline"
              accessibilityRole="button"
              accessibilityLabel="Từ chối lời mời"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => {
                if (!disabled) setConfirmingDecline(true);
              }}
              style={{
                minHeight: 52,
                paddingHorizontal: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>
                {inFlight === 'DECLINE' ? 'Đang xác minh…' : 'Từ chối lời mời'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          testID="invitation-back"
          accessibilityRole="button"
          accessibilityLabel="Quay lại danh sách lời mời"
          accessibilityHint="Trở về danh sách lời mời mà không gửi phản hồi"
          onPress={onBack}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Quay lại</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="invitation-refresh"
          accessibilityRole="button"
          accessibilityLabel="Làm mới lời mời"
          onPress={onRefresh}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 }}>Làm mới</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
