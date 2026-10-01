import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supportCasesApi, type MySupportCase, type SupportCaseType } from '../../api/support-cases.api';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  allowedCustomerComplaintTypes,
  canMarkComplaintUrgent,
  complaintTypeLabel,
  formatSupportCaseDateTime,
  isOpenSupportCase,
  supportCaseStatusLabels,
  validateSupportCaseReason,
} from './customer-support-cases';

interface Props {
  orderId: string;
  orderStatus: string;
  completedAt?: string | null;
}

const PAGE_LIMIT = 20;

export default function CustomerSupportCasesSection({
  orderId,
  orderStatus,
  completedAt,
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const requestGeneration = useRef(0);

  const [cases, setCases] = useState<MySupportCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [caseType, setCaseType] = useState<SupportCaseType | null>(null);
  const [reason, setReason] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<MySupportCase | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const allowedTypes = useMemo(
    () => allowedCustomerComplaintTypes(orderStatus, completedAt),
    [orderStatus, completedAt],
  );
  const canCreate = allowedTypes.length > 0;
  const canUrgent = canMarkComplaintUrgent(orderStatus);

  const loadCases = useCallback(async (refresh = false) => {
    const generation = ++requestGeneration.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const result = await supportCasesApi.listMine({
        page: 1,
        limit: PAGE_LIMIT,
        serviceOrderId: orderId,
      });
      if (generation !== requestGeneration.current) return;
      setCases(result.data);
      setTotal(result.total);
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      setLoadError(extractApiErrorMessage(
        error,
        'Không thể tải danh sách khiếu nại. Vui lòng thử lại.',
      ));
    } finally {
      if (generation === requestGeneration.current) {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    void loadCases();
    return () => {
      requestGeneration.current += 1;
    };
  }, [loadCases]));

  const openForm = () => {
    if (!canCreate) return;
    setCaseType(allowedTypes[0] ?? null);
    setReason('');
    setUrgent(false);
    setFormError(null);
    setNeedsVerify(false);
    setNotice(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formBusy) return;
    setFormOpen(false);
  };

  const submit = async () => {
    if (formBusy || needsVerify) return;
    if (!caseType || !allowedTypes.includes(caseType)) {
      setFormError('Vui lòng chọn loại vấn đề phù hợp với trạng thái đơn.');
      return;
    }
    const reasonError = validateSupportCaseReason(reason);
    if (reasonError) {
      setFormError(reasonError);
      return;
    }
    setFormBusy(true);
    setFormError(null);
    try {
      await supportCasesApi.createCase({
        caseType,
        reason: reason.trim(),
        serviceOrderId: orderId,
        ...(urgent && canUrgent ? { isUrgent: true } : {}),
      });
      setFormOpen(false);
      setReason('');
      setUrgent(false);
      setNotice('Đã gửi khiếu nại. Quản lý dịch vụ sẽ phản hồi cho bạn sớm nhất.');
      await loadCases(true);
    } catch (error) {
      setNeedsVerify(true);
      setFormError(extractApiErrorMessage(
        error,
        'Chưa xác nhận được kết quả. Hãy kiểm tra danh sách khiếu nại trước khi gửi lại.',
      ));
    } finally {
      setFormBusy(false);
    }
  };

  const reconcileCreate = async () => {
    if (formBusy) return;
    setFormBusy(true);
    try {
      await loadCases(true);
      setNeedsVerify(false);
      setFormError('Đã tải lại danh sách. Hãy kiểm tra bên dưới trước khi quyết định gửi lại.');
    } finally {
      setFormBusy(false);
    }
  };

  const openDetail = async (item: MySupportCase) => {
    setDetailOpen(true);
    setDetail(item);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const fresh = await supportCasesApi.getMine(item.id);
      setDetail(fresh);
      setCases((current) => current.map((row) => row.id === fresh.id ? fresh : row));
    } catch (error) {
      setDetailError(extractApiErrorMessage(
        error,
        'Không thể tải chi tiết khiếu nại. Vui lòng thử lại.',
      ));
    } finally {
      setDetailLoading(false);
    }
  };

  const statusColor = (status: MySupportCase['status']) => {
    if (status === 'resolved') return colors.success;
    if (status === 'rejected') return colors.textSecondary;
    if (status === 'in_review') return colors.primary;
    return colors.warning;
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.sectionTitle}>Hỗ trợ & khiếu nại</Text>
            <Text style={styles.helper}>
              Nếu có vấn đề với kỹ thuật viên hoặc đơn sửa chữa, bạn có thể gửi khiếu nại tại đây.
            </Text>
          </View>
          <Ionicons name="help-buoy-outline" size={24} color={colors.primary} />
        </View>

        {!!notice && (
          <View style={styles.notice}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.helper}>Đang tải khiếu nại...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => void loadCases(true)} disabled={refreshing} accessibilityRole="button">
              <Text style={styles.linkText}>{refreshing ? 'Đang tải...' : 'Tải lại'}</Text>
            </TouchableOpacity>
          </View>
        ) : cases.length === 0 ? (
          <Text style={styles.helper}>Bạn chưa gửi khiếu nại nào cho đơn này.</Text>
        ) : (
          <View style={styles.caseList}>
            {cases.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.caseRow}
                onPress={() => void openDetail(item)}
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết khiếu nại ${complaintTypeLabel(item.caseType)}`}
                activeOpacity={0.8}
              >
                <View style={styles.caseIcon}>
                  <Ionicons
                    name={item.isUrgent && isOpenSupportCase(item) ? 'alert-circle-outline' : 'chatbox-ellipses-outline'}
                    size={19}
                    color={item.isUrgent && isOpenSupportCase(item) ? colors.error : colors.primary}
                  />
                </View>
                <View style={styles.caseCopy}>
                  <Text style={styles.caseTitle}>{complaintTypeLabel(item.caseType)}</Text>
                  <Text style={styles.caseReason} numberOfLines={2}>{item.reason}</Text>
                  <Text style={styles.caseMeta}>
                    {formatSupportCaseDateTime(item.createdAt)}
                    {item.isUrgent && isOpenSupportCase(item) ? ' · Cần hỗ trợ ngay' : ''}
                  </Text>
                </View>
                <View style={styles.caseTrailing}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {supportCaseStatusLabels[item.status]}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </View>
              </TouchableOpacity>
            ))}
            {total > cases.length && (
              <Text style={styles.helper}>Đang hiển thị {cases.length}/{total} khiếu nại gần nhất.</Text>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={[styles.helper, { flex: 1 }]}>
            {canCreate
              ? 'Loại khiếu nại được giới hạn theo trạng thái hiện tại của đơn.'
              : String(orderStatus).toUpperCase() === 'COMPLETED'
                ? 'Đơn này không còn nhận khiếu nại thông thường. Nếu còn hạn bảo hành, hãy dùng mục Bảo hành.'
                : 'Trạng thái hiện tại chưa hỗ trợ gửi khiếu nại.'}
          </Text>
          <TouchableOpacity
            style={[styles.createButton, !canCreate && styles.disabled]}
            onPress={openForm}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Gửi khiếu nại"
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Gửi khiếu nại</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.modalTitle}>Gửi khiếu nại</Text>
                <Text style={styles.helper}>Chọn vấn đề đúng với đơn hiện tại để quản lý dịch vụ xử lý.</Text>
              </View>
              <TouchableOpacity onPress={closeForm} disabled={formBusy} accessibilityRole="button" accessibilityLabel="Đóng">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Loại vấn đề</Text>
            <View style={styles.typeList}>
              {allowedTypes.map((type) => {
                const selected = type === caseType;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChoice,
                      selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                    ]}
                    onPress={() => setCaseType(type)}
                    disabled={formBusy}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={19}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text style={styles.typeChoiceText}>{complaintTypeLabel(type)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Mô tả vấn đề</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              editable={!formBusy}
              multiline
              maxLength={2000}
              placeholder="Mô tả rõ điều đã xảy ra để quản lý dịch vụ xử lý nhanh hơn"
              placeholderTextColor={colors.muted}
              style={styles.textArea}
              textAlignVertical="top"
              accessibilityLabel="Mô tả khiếu nại"
            />
            <Text style={styles.helper}>Tối thiểu 10 ký tự.</Text>

            {canUrgent && (
              <View style={styles.urgentRow}>
                <View style={styles.headerCopy}>
                  <Text style={styles.urgentTitle}>Cần hỗ trợ ngay</Text>
                  <Text style={styles.helper}>Dùng khi đơn đang được thực hiện và cần quản lý dịch vụ can thiệp sớm.</Text>
                </View>
                <Switch value={urgent} onValueChange={setUrgent} disabled={formBusy} />
              </View>
            )}

            {!!formError && <Text style={styles.errorText}>{formError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={closeForm} disabled={formBusy}>
                <Text style={styles.secondaryButtonText}>Đóng</Text>
              </TouchableOpacity>
              {needsVerify ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => void reconcileCreate()} disabled={formBusy}>
                  {formBusy
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.primaryButtonText}>Kiểm tra danh sách</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={() => void submit()} disabled={formBusy}>
                  {formBusy
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.primaryButtonText}>Gửi khiếu nại</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !detailLoading && setDetailOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.modalTitle}>Chi tiết khiếu nại</Text>
                {!!detail && <Text style={styles.helper}>{complaintTypeLabel(detail.caseType)}</Text>}
              </View>
              <TouchableOpacity
                onPress={() => setDetailOpen(false)}
                disabled={detailLoading}
                accessibilityRole="button"
                accessibilityLabel="Đóng"
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {detailLoading && !detail ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.helper}>Đang tải chi tiết...</Text>
              </View>
            ) : detail ? (
              <View style={styles.detailBody}>
                <View style={styles.detailTopRow}>
                  <Text style={[styles.statusText, { color: statusColor(detail.status) }]}>
                    {supportCaseStatusLabels[detail.status]}
                  </Text>
                  {detail.isUrgent && isOpenSupportCase(detail) && (
                    <Text style={styles.urgentBadge}>Cần hỗ trợ ngay</Text>
                  )}
                </View>

                <Text style={styles.detailLabel}>Nội dung bạn thấy</Text>
                <Text style={styles.detailText}>{detail.reason}</Text>

                {!!detail.description && (
                  <>
                    <Text style={styles.detailLabel}>Mô tả thêm</Text>
                    <Text style={styles.detailText}>{detail.description}</Text>
                  </>
                )}

                {!!detail.respondBy && isOpenSupportCase(detail) && (
                  <View style={styles.infoBox}>
                    <Ionicons name="time-outline" size={18} color={colors.primary} />
                    <Text style={styles.infoText}>
                      Quản lý dịch vụ dự kiến phản hồi trước {formatSupportCaseDateTime(detail.respondBy)}.
                    </Text>
                  </View>
                )}

                {!!detail.resolutionReason && (
                  <View style={styles.resolutionBox}>
                    <Text style={styles.detailLabel}>Kết quả xử lý</Text>
                    <Text style={styles.detailText}>{detail.resolutionReason}</Text>
                  </View>
                )}

                <Text style={styles.helper}>Gửi lúc {formatSupportCaseDateTime(detail.createdAt)}</Text>
                {!!detail.resolvedAt && (
                  <Text style={styles.helper}>Kết thúc lúc {formatSupportCaseDateTime(detail.resolvedAt)}</Text>
                )}

                {!!detailError && <Text style={styles.errorText}>{detailError}</Text>}
              </View>
            ) : (
              <Text style={styles.errorText}>{detailError || 'Không thể tải chi tiết khiếu nại.'}</Text>
            )}

            <View style={styles.modalActions}>
              {!!detailError && !!detail && (
                <TouchableOpacity onPress={() => void openDetail(detail)} style={styles.secondaryButton} disabled={detailLoading}>
                  <Text style={styles.secondaryButtonText}>Tải lại</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={() => setDetailOpen(false)} disabled={detailLoading}>
                <Text style={styles.primaryButtonText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 },
  helper: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  notice: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.text },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  errorText: { fontSize: 12, lineHeight: 17, color: colors.error },
  linkText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  caseList: { gap: 8 },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 11,
  },
  caseIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  caseCopy: { flex: 1 },
  caseTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  caseReason: { fontSize: 12, lineHeight: 17, color: colors.text, marginTop: 2 },
  caseMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
  caseTrailing: { alignItems: 'flex-end', gap: 5, maxWidth: 110 },
  statusText: { fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'right' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  createButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  createButtonText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 3 },
  fieldLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8, marginTop: 4 },
  typeList: { gap: 7, marginBottom: 14 },
  typeChoice: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 11,
  },
  typeChoiceText: { flex: 1, fontSize: 13, color: colors.text },
  textArea: {
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    color: colors.text,
    padding: 12,
    fontSize: 14,
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 11,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  urgentTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  secondaryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },
  primaryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  detailBody: { gap: 10 },
  detailTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  urgentBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.error,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  detailLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  detailText: { fontSize: 13, lineHeight: 19, color: colors.text },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    padding: 10,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.text },
  resolutionBox: {
    borderRadius: 11,
    backgroundColor: colors.background,
    padding: 10,
    gap: 4,
  },
});
