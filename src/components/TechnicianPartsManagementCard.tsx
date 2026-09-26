import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  partRequestsApi,
  type PartRequest,
  type PartRequestStatus,
  type PartUsageStatus,
} from '../api/part-requests.api';
import TechnicianPartOrderModal from './TechnicianPartOrderModal';
import { formatVnd } from './FixHomePartPickerModal';
import { useAppTheme } from '../constants/theme';

export interface TechnicianPartsManagementCardProps {
  orderId: string;
  orderStatus: string;
  onPartsUpdated?: () => void;
}

const getStatusBadge = (status: PartRequestStatus) => {
  switch (status) {
    case 'requested':
      return { label: 'Chờ kho chuẩn bị', bg: '#FEF3C7', text: '#92400E', icon: 'hourglass-outline' };
    case 'ready':
      return { label: 'Sẵn sàng nhận', bg: '#DBEAFE', text: '#1E40AF', icon: 'checkmark-circle-outline' };
    case 'delivering':
      return { label: 'Đang giao hàng', bg: '#F3E8FF', text: '#6B21A8', icon: 'bicycle-outline' };
    case 'received':
      return { label: 'Đã nhận linh kiện', bg: '#D1FAE5', text: '#065F46', icon: 'cube-outline' };
    case 'completed':
      return { label: 'Đã hoàn tất', bg: '#E2E8F0', text: '#334155', icon: 'checkmark-done-outline' };
    case 'cancelled':
      return { label: 'Đã huỷ', bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle-outline' };
    default:
      return { label: status, bg: '#F1F5F9', text: '#475569', icon: 'help-circle-outline' };
  }
};

const getUsageBadge = (usage: PartUsageStatus) => {
  switch (usage) {
    case 'used':
      return { label: 'Đã lắp vào máy', bg: '#D1FAE5', text: '#065F46' };
    case 'returned':
      return { label: 'Trả lại kho', bg: '#FEE2E2', text: '#991B1B' };
    default:
      return { label: 'Chưa sử dụng', bg: '#FEF3C7', text: '#92400E' };
  }
};

export default function TechnicianPartsManagementCard({
  orderId,
  orderStatus,
  onPartsUpdated,
}: TechnicianPartsManagementCardProps) {
  const { isDark } = useAppTheme();
  const [partRequests, setPartRequests] = useState<PartRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // QR receive modal state
  const [receivingRequest, setReceivingRequest] = useState<PartRequest | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await partRequestsApi.getByOrderId(orderId);
      setPartRequests(res);
    } catch {
      // Ignore network errors on passive load
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void partRequestsApi.getByOrderId(orderId).then((res) => {
        if (active) setPartRequests(res);
      }).catch(() => {});
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [orderId]);

  const handleOpenReceiveModal = (request: PartRequest) => {
    setReceivingRequest(request);
    setQrToken(request.qrToken || '');
  };

  const handleConfirmReceive = async (tokenToUse?: string) => {
    if (!receivingRequest) return;
    const finalToken = tokenToUse || qrToken.trim();
    if (!finalToken) {
      Alert.alert('Chưa có mã QR', 'Vui lòng nhập mã QR token nhận hàng.');
      return;
    }

    try {
      setActionLoading(true);
      await partRequestsApi.receiveByQr(receivingRequest.id, { qrToken: finalToken });
      Alert.alert('Thành công', 'Đã xác nhận nhận linh kiện từ kho FixHome!');
      setReceivingRequest(null);
      setQrToken('');
      void loadRequests();
      onPartsUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Mã QR không đúng hoặc yêu cầu chưa sẵn sàng giao nhận.';
      Alert.alert('Lỗi xác nhận', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateItemUsage = async (
    requestId: string,
    itemId: string,
    usageStatus: 'used' | 'returned',
  ) => {
    try {
      setActionLoading(true);
      await partRequestsApi.updateItemUsage(requestId, itemId, { usageStatus });
      Alert.alert(
        'Đã cập nhật',
        usageStatus === 'used' ? 'Linh kiện đã được ghi nhận ĐÃ DÙNG.' : 'Linh kiện sẽ được HOÀN TRẢ kho.',
      );
      void loadRequests();
      onPartsUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể cập nhật trạng thái sử dụng linh kiện.';
      Alert.alert('Lỗi', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const isEligibleToOrder = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(
    orderStatus.toUpperCase(),
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="cube" size={20} color="#2563EB" />
          <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
            Linh kiện FixHome ({partRequests.length})
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={loadRequests} style={styles.refreshBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="refresh" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.cardDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
        Kỹ thuật viên có thể yêu cầu linh kiện chính hãng từ kho FixHome trước hoặc trong quá trình sửa chữa.
      </Text>

      {/* Loading */}
      {loading && partRequests.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Đang kiểm tra linh kiện...</Text>
        </View>
      ) : partRequests.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Ionicons name="cube-outline" size={32} color="#94A3B8" />
          <Text style={[styles.emptyText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Chưa có yêu cầu linh kiện nào cho đơn hàng này.
          </Text>
        </View>
      ) : (
        <View style={styles.requestsList}>
          {partRequests.map((req) => {
            const badge = getStatusBadge(req.status);
            const canReceive = ['ready', 'delivering'].includes(req.status.toLowerCase());
            const isReceived = req.status.toLowerCase() === 'received';

            return (
              <View
                key={req.id}
                style={[
                  styles.requestItem,
                  { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' },
                ]}
              >
                {/* Request Header */}
                <View style={styles.reqHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon as any} size={12} color={badge.text} />
                    <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
                  </View>

                  <View style={styles.fulfillmentBadge}>
                    <Ionicons
                      name={req.fulfillmentMethod === 'delivery' ? 'bicycle-outline' : 'storefront-outline'}
                      size={12}
                      color="#475569"
                    />
                    <Text style={styles.fulfillmentText}>
                      {req.fulfillmentMethod === 'delivery' ? 'Giao hàng' : 'Tự lấy tại kho'}
                    </Text>
                  </View>
                </View>

                {!!req.reason && (
                  <Text style={[styles.reasonText, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                    Lý do: {req.reason}
                  </Text>
                )}

                {/* Items in Request */}
                <View style={styles.itemsContainer}>
                  {req.items.map((item) => {
                    const usage = getUsageBadge(item.usageStatus);
                    return (
                      <View key={item.id} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                            {item.partNameSnapshot} × {item.quantity}
                          </Text>
                          <Text style={styles.itemPrice}>
                            {formatVnd(item.unitPriceSnapshot * item.quantity)}
                          </Text>
                        </View>

                        <View style={styles.itemRightActions}>
                          <View style={[styles.usageBadge, { backgroundColor: usage.bg }]}>
                            <Text style={[styles.usageText, { color: usage.text }]}>{usage.label}</Text>
                          </View>

                          {/* Usage action buttons if request is RECEIVED and item is PENDING */}
                          {isReceived && item.usageStatus === 'pending' && (
                            <View style={styles.usageButtonsRow}>
                              <TouchableOpacity
                                style={styles.useBtn}
                                onPress={() => handleUpdateItemUsage(req.id, item.id, 'used')}
                                disabled={actionLoading}
                              >
                                <Text style={styles.useBtnText}>Đã dùng</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.returnBtn}
                                onPress={() => handleUpdateItemUsage(req.id, item.id, 'returned')}
                                disabled={actionLoading}
                              >
                                <Text style={styles.returnBtnText}>Trả kho</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Action to receive parts via QR */}
                {canReceive && (
                  <TouchableOpacity
                    style={styles.receiveActionBtn}
                    onPress={() => handleOpenReceiveModal(req)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.receiveActionBtnText}>Xác nhận đã nhận linh kiện</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Button to order new parts */}
      {isEligibleToOrder && (
        <TouchableOpacity
          style={styles.orderPartsBtn}
          onPress={() => setShowOrderModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
          <Text style={styles.orderPartsBtnText}>+ Yêu cầu linh kiện từ kho FixHome</Text>
        </TouchableOpacity>
      )}

      {/* Order Modal */}
      <TechnicianPartOrderModal
        visible={showOrderModal}
        orderId={orderId}
        onClose={() => setShowOrderModal(false)}
        onSuccess={() => {
          void loadRequests();
          onPartsUpdated?.();
        }}
      />

      {/* QR Confirmation Modal */}
      <Modal visible={!!receivingRequest} transparent animationType="fade">
        <View style={styles.qrModalOverlay}>
          <View style={[styles.qrModalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={[styles.qrModalTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Xác nhận nhận linh kiện
            </Text>
            <Text style={[styles.qrModalDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Nhập mã QR Token nhận hàng từ kho hoặc bấm Quét kiểm tra thử để xác nhận nhận linh kiện.
            </Text>

            <TextInput
              style={[
                styles.qrInput,
                { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F8FAFC' : '#0F172A' },
              ]}
              placeholder="Nhập mã QR Token..."
              placeholderTextColor="#94A3B8"
              value={qrToken}
              onChangeText={setQrToken}
            />

            <View style={styles.qrBtnGroup}>
              <TouchableOpacity
                style={styles.qrSimulateBtn}
                onPress={() => handleConfirmReceive('TEST_SCAN')}
                disabled={actionLoading}
              >
                <Ionicons name="flash-outline" size={16} color="#059669" />
                <Text style={styles.qrSimulateBtnText}>Xác nhận nhanh (Simulate)</Text>
              </TouchableOpacity>

              <View style={styles.qrActionRow}>
                <TouchableOpacity
                  style={[styles.qrBtn, styles.qrCancelBtn]}
                  onPress={() => setReceivingRequest(null)}
                  disabled={actionLoading}
                >
                  <Text style={styles.qrCancelBtnText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.qrBtn, styles.qrSubmitBtn]}
                  onPress={() => handleConfirmReceive()}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.qrSubmitBtnText}>Xác nhận</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtn: {
    padding: 4,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  requestsList: {
    gap: 12,
  },
  requestItem: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fulfillmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fulfillmentText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  reasonText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  itemsContainer: {
    gap: 8,
    paddingTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 1,
  },
  itemRightActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  usageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  usageText: {
    fontSize: 10,
    fontWeight: '700',
  },
  usageButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  useBtn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  useBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  returnBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  returnBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  receiveActionBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    height: 38,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  receiveActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  orderPartsBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  orderPartsBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  qrModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  qrModalDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  qrInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  qrBtnGroup: {
    gap: 10,
  },
  qrSimulateBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    height: 40,
    borderRadius: 10,
    gap: 6,
  },
  qrSimulateBtnText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
  },
  qrActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  qrBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  qrCancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  qrSubmitBtn: {
    backgroundColor: '#2563EB',
  },
  qrSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
