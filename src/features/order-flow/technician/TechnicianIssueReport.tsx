import React, { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import PillText from '../../../components/PillText';
import { supportCasesApi } from '../../../api/support-cases.api';
import { useAppTheme } from '../../../constants/theme';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import {
  technicianReportBody, technicianReportProblem, technicianReportReasons, type TechnicianReportReasonCode,
} from './technician-report';

export default function TechnicianIssueReport({ orderId }: { orderId: string }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<TechnicianReportReasonCode | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const problem = technicianReportProblem(code, reason);

  const submit = async () => {
    if (problem || !code || busy) return;
    setBusy(true);
    setError('');
    try {
      await supportCasesApi.createTechnicianReport(technicianReportBody(orderId, code, reason));
      setSent(true);
      setOpen(false);
      setCode(null);
      setReason('');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Chưa gửi được báo cáo. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <TouchableOpacity testID="tech-issue-report-open" accessibilityRole="button" style={styles.openButton} onPress={() => { setError(''); setOpen(true); }}>
        <Text style={styles.openText}>Báo sự cố / không đủ khả năng sửa</Text>
      </TouchableOpacity>
      {sent ? <Text testID="tech-issue-report-sent" style={styles.note}>Đã gửi báo cáo cho quản lý. Công việc vẫn tiếp tục, báo cáo không hủy đơn.</Text> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Báo sự cố</Text>
              <Text style={styles.note}>Quản lý sẽ xem xét. Báo cáo không dừng, không hủy đơn và không trừ điểm.</Text>
              <Text style={styles.label}>Nguyên nhân</Text>
              <View style={styles.chips}>
                {technicianReportReasons.map(item => (
                  <TouchableOpacity key={item.code} testID={`tech-issue-reason-${item.code}`} accessibilityRole="button"
                    accessibilityState={{ selected: code === item.code }}
                    style={[styles.chip, code === item.code && { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft }]}
                    onPress={() => setCode(item.code)}>
                    <PillText style={styles.chipText}>{item.label}</PillText>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Mô tả</Text>
              <TextInput testID="tech-issue-reason-text" multiline maxLength={2000} value={reason} onChangeText={setReason}
                placeholder="Mô tả tình trạng thiết bị, đã kiểm tra gì" placeholderTextColor={colors.textSecondary}
                style={styles.input} />
              {reason.length > 0 && problem ? <Text style={styles.note}>{problem}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => setOpen(false)}>
                  <Text style={styles.secondaryText}>Đóng</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="tech-issue-report-submit" accessibilityRole="button" disabled={!!problem || busy}
                  style={[styles.primary, (!!problem || busy) && { opacity: 0.5 }]} onPress={() => void submit()}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Gửi báo cáo</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  openButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  openText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  note: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  error: { fontSize: 13, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 13, color: colors.text },
  input: { minHeight: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '600' },
  primary: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  primaryText: { color: '#fff', fontWeight: '700' },
});
