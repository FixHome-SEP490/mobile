import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { servicesApi, type CategoryItem, type ServiceItem } from '../../api/services.api';
import { technicianProfileApi, type TechnicianServiceOffering } from '../../api/technician-profile.api';
import BackButton from '../../components/BackButton';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../constants/keyboard';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { useAppTheme } from '../../constants/theme';
import CategoryEvidenceSection from './CategoryEvidenceSection';
import { evidenceCategories } from './technician-skills';

/**
 * One place for the papers that prove the technician's skills, apart from the skills list: what was sent (a paper that
 * already helped approve a skill is locked), and new papers, each for the groups the technician ticks.
 */
export default function TechnicianEvidenceScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [offerings, setOfferings] = useState<Record<string, TechnicianServiceOffering>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [papersTick, setPapersTick] = useState(0);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, cats, mine] = await Promise.all([
        servicesApi.getServices({ pageSize: 100 }),
        servicesApi.getCategories(),
        technicianProfileApi.getMyServices(),
      ]);
      setServices(catalog.data);
      setCategories(cats);
      setOfferings(Object.fromEntries(mine.map((o) => [o.serviceId, o])));
    } catch {
      setError('Không thể tải dữ liệu. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const rejectedIds = useMemo(
    () => Object.values(offerings).filter((o) => o.isActive && o.verificationStatus === 'rejected').map((o) => o.serviceId),
    [offerings],
  );
  // One request per refused skill, one after the other (Backend opens a request per skill); the papers already sent go with them.
  const resubmitAll = async () => {
    setResending(true);
    setNotice('');
    try {
      for (const serviceId of rejectedIds) await technicianProfileApi.resubmitSkill(serviceId);
      setNotice('Đã gửi lại để xét duyệt. FixHome sẽ báo cho bạn khi có kết quả.');
    } catch (err: unknown) {
      Alert.alert('Chưa gửi lại được', extractApiErrorMessage(err, 'Vui lòng thử lại.'));
    } finally {
      setResending(false);
      setPapersTick((n) => n + 1);
      void load();
    }
  };

  const paperCategories = useMemo(() => evidenceCategories(services, categories, offerings), [services, categories, offerings]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle} accessibilityRole="header">Giấy tờ chứng minh</Text>
          <View style={styles.headerSpacer} />
        </View>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primaryStrong} />
        ) : error ? (
          <View style={styles.errorBlock} accessibilityRole="alert">
            <Text style={styles.hint}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Thử lại" onPress={() => void load()} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.hint}>
              Giấy tờ đã được dùng để duyệt kỹ năng thì không xóa được nữa. Giấy tờ đang chờ duyệt hoặc của kỹ năng bị từ chối thì xóa được. Muốn đổi giấy tờ, hãy xóa rồi thêm giấy tờ mới. Khi hồ sơ đang chờ xét duyệt thì chưa xóa được giấy tờ nào.
            </Text>
            {rejectedIds.length > 0 && (
              <View style={styles.resend} testID="evidence-rejected-box">
                <Text style={styles.hint}>
                  {`${rejectedIds.length} kỹ năng bị từ chối. Xóa giấy tờ không phù hợp hoặc thêm giấy tờ mới bên dưới nếu cần, rồi gửi lại để FixHome xét duyệt.`}
                </Text>
                <Pressable testID="evidence-resubmit-all" accessibilityRole="button" accessibilityLabel="Gửi lại để xét duyệt" disabled={resending}
                  accessibilityState={{ disabled: resending, busy: resending }} onPress={() => void resubmitAll()} style={styles.primaryBtn}>
                  {resending ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Gửi lại để xét duyệt</Text>}
                </Pressable>
              </View>
            )}
            {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.noticeOk} testID="evidence-notice">{notice}</Text>}
            <CategoryEvidenceSection staged={[]} onChange={() => undefined} categories={paperCategories} refreshKey={papersTick} sendNow onSent={() => setPapersTick((n) => n + 1)} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  headerSpacer: { width: 44, height: 44 },
  loader: { marginTop: 48 },
  errorBlock: { padding: 16, gap: 12, alignItems: 'flex-start' },
  content: { padding: 16, gap: 12 },
  resend: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.tone.warning.bg },
  noticeOk: { color: colors.tone.success.text, backgroundColor: colors.tone.success.bg, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  primaryBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14, lineHeight: 20 },
});
