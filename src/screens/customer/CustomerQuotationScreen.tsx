import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type ServiceOrderItem, type QuotationLineItem } from '../../api/orders.api';

type DetailRoute = RouteProp<RootStackParamList, 'CustomerQuotation'>;

export default function CustomerQuotationScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors, isDark);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const orderId = route.params && typeof route.params === 'object' && 'orderId' in route.params ? route.params.orderId : undefined;

  const [loading, setLoading] = useState(Boolean(orderId));
  const [actionLoading, setActionLoading] = useState(false);
  const [order, setOrder] = useState<ServiceOrderItem | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    ordersApi
      .getOrder(orderId)
      .then((res) => {
        if (active) setOrder(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  const handleApprove = async () => {
    if (order?.quotation?.id) {
      try {
        setActionLoading(true);
        await ordersApi.approveQuotation(order.quotation.id);
        Alert.alert('Thành công', 'Bạn đã phê duyệt báo giá. Kỹ thuật viên sẽ tiến hành sửa chữa.', [
          { text: 'OK', onPress: () => navigation.navigate('CustomerUnderRepair') },
        ]);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Không thể duyệt báo giá. Vui lòng thử lại.';
        Alert.alert('Lỗi', msg);
      } finally {
        setActionLoading(false);
      }
    } else {
      navigation.navigate('CustomerUnderRepair');
    }
  };

  const handleReject = async () => {
    Alert.alert(
      'Xác nhận từ chối',
      'Từ chối báo giá sẽ hủy toàn bộ đơn dịch vụ này. Bạn có chắc chắn muốn từ chối?',
      [
        { text: 'Quay lại', style: 'cancel' },
        {
          text: 'Từ chối đơn',
          style: 'destructive',
          onPress: async () => {
            if (order?.quotation?.id) {
              try {
                setActionLoading(true);
                await ordersApi.rejectQuotation(order.quotation.id);
                Alert.alert('Đã từ chối', 'Đơn hàng đã được huỷ theo yêu cầu.', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (err: unknown) {
                const msg =
                  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                  'Không thể từ chối báo giá.';
                Alert.alert('Lỗi', msg);
              } finally {
                setActionLoading(false);
              }
            } else {
              navigation.goBack();
            }
          },
        },
      ],
    );
  };

  const items: QuotationLineItem[] =
    order?.quotation?.items && order.quotation.items.length > 0
      ? order.quotation.items
      : [
          {
            type: 'LABOR',
            description: 'Vệ sinh điều hòa chuyên sâu',
            quantity: 1,
            unitPrice: 150000,
            lineTotal: 150000,
          },
          {
            type: 'PARTS',
            description: 'Thay tụ ngậm 35µF chính hãng',
            quantity: 1,
            unitPrice: 180000,
            lineTotal: 180000,
            partCatalogId: 'fh-part-cap',
            partSource: 'fixhome',
            warrantyDays: 180,
          },
          {
            type: 'LABOR',
            description: 'Công tháo lắp và kiểm tra mạch nguồn',
            quantity: 1,
            unitPrice: 70000,
            lineTotal: 70000,
          },
        ];

  const grandTotal =
    order?.quotation
      ? (order.quotation.laborTotal || 0) + (order.quotation.partsTotal || 0)
      : items.reduce((sum, item) => sum + (item.lineTotal || item.unitPrice * item.quantity), 0);

  const laborTotal = items
    .filter((i) => i.type === 'LABOR')
    .reduce((sum, item) => sum + (item.lineTotal || item.unitPrice * item.quantity), 0);

  const partsTotal = items
    .filter((i) => i.type === 'PARTS')
    .reduce((sum, item) => sum + (item.lineTotal || item.unitPrice * item.quantity), 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Đang tải thông tin báo giá...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết báo giá dịch vụ</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Chờ bạn duyệt</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Notice Box */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle" size={20} color="#854D0E" style={{ marginTop: 2 }} />
          <Text style={styles.noticeText}>
            Kỹ thuật viên đã kiểm tra hiện trường và lập bảng phân tách công thợ & linh kiện. Bạn cần duyệt báo giá trước khi thợ tiến hành sửa chữa.
          </Text>
        </View>

        {/* Quotation Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              {order?.quotation?.id ? `Báo giá #${order.quotation.id.slice(0, 8).toUpperCase()}` : 'Báo giá khảo sát #QT-8821'}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>Chính thức</Text>
            </View>
          </View>

          {/* Breakdown summary */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Tiền công thợ</Text>
              <Text style={styles.summaryVal}>{laborTotal.toLocaleString('vi-VN')} đ</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Linh kiện</Text>
              <Text style={styles.summaryVal}>{partsTotal.toLocaleString('vi-VN')} đ</Text>
            </View>
          </View>

          {/* Items List */}
          <View style={styles.itemsList}>
            {items.map((item, idx) => {
              const isPart = item.type === 'PARTS';
              const isFixHome = !!item.partCatalogId || item.partSource === 'fixhome';
              return (
                <View key={item.id ?? idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.itemTopLine}>
                      <View style={[styles.typeBadge, isPart ? styles.partBadge : styles.laborBadge]}>
                        <Text style={[styles.typeBadgeText, isPart ? styles.partBadgeText : styles.laborBadgeText]}>
                          {isPart ? 'Linh kiện' : 'Công thợ'}
                        </Text>
                      </View>
                      <Text style={styles.itemNameText}>{item.description}</Text>
                    </View>

                    {/* Metadata tags */}
                    <View style={styles.metaTagsRow}>
                      <Text style={styles.qtyText}>SL: {item.quantity}</Text>
                      {isFixHome && (
                        <View style={styles.fixhomeTag}>
                          <Ionicons name="shield-checkmark" size={11} color="#059669" />
                          <Text style={styles.fixhomeTagText}>Kho chính hãng FixHome</Text>
                        </View>
                      )}
                      {!!item.warrantyDays && (
                        <View style={styles.warrantyTag}>
                          <Text style={styles.warrantyTagText}>BH {item.warrantyDays} ngày</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={styles.itemPriceText}>
                    {(item.lineTotal || item.unitPrice * item.quantity).toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.divider} />
          <View style={styles.quoteRowTotal}>
            <Text style={styles.totalLabel}>Tổng chi phí dịch vụ</Text>
            <Text style={styles.totalValue}>{grandTotal.toLocaleString('vi-VN')} đ</Text>
          </View>
        </View>

        {/* Technician Notes */}
        <Text style={styles.sectionTitle}>Ghi chú từ kỹ thuật viên</Text>
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Thiết bị đã được đo kiểm thông số kỹ thuật. Các linh kiện thay thế cam kết chính hãng, có tem bảo hành niêm phong từ hệ thống FixHome.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleReject}
            disabled={actionLoading}
            accessibilityLabel="Từ chối báo giá"
          >
            <Text style={styles.secondaryBtnText}>Từ chối</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleApprove}
            disabled={actionLoading}
            accessibilityLabel="Duyệt báo giá"
          >
            {actionLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Duyệt báo giá ({grandTotal.toLocaleString('vi-VN')} đ)
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 },
    badge: { backgroundColor: '#FEF9C3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: '#A16207', fontSize: 11, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 110, gap: 14 },
    noticeBox: {
      flexDirection: 'row',
      backgroundColor: '#FEF9C3',
      padding: 14,
      borderRadius: 12,
      gap: 10,
      borderWidth: 1,
      borderColor: '#FDE047',
    },
    noticeText: { color: '#854D0E', fontSize: 13, lineHeight: 19, flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    statusPill: {
      backgroundColor: '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusPillText: { fontSize: 11, fontWeight: '700', color: '#059669' },
    summaryBar: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryCol: { flex: 1, alignItems: 'center' },
    summaryDivider: { width: 1, backgroundColor: colors.border },
    summaryLabel: { fontSize: 11, color: colors.textSecondary },
    summaryVal: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
    itemsList: { gap: 10 },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    itemTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    typeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    typeBadgeText: { fontSize: 10, fontWeight: '700' },
    laborBadge: { backgroundColor: '#EFF6FF' },
    laborBadgeText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    partBadge: { backgroundColor: '#ECFDF5' },
    partBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669' },
    itemNameText: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1 },
    metaTagsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    qtyText: { fontSize: 11, color: colors.textSecondary },
    fixhomeTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ECFDF5',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      gap: 3,
    },
    fixhomeTagText: { fontSize: 10, fontWeight: '700', color: '#059669' },
    warrantyTag: {
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    warrantyTagText: { fontSize: 10, fontWeight: '600', color: '#2563EB' },
    itemPriceText: { fontSize: 14, fontWeight: '800', color: colors.primary },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    quoteRowTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    totalValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
    noteCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noteText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    btnRow: { flexDirection: 'row', gap: 12 },
    secondaryBtn: {
      flex: 1,
      backgroundColor: '#FEE2E2',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
    primaryBtn: {
      flex: 2,
      backgroundColor: '#2563EB',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    centerLoading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: { fontSize: 14, color: '#64748B' },
  });
