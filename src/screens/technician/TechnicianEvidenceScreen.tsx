import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { servicesApi, type CategoryItem, type ServiceItem } from '../../api/services.api';
import { technicianProfileApi, type TechnicianServiceOffering } from '../../api/technician-profile.api';
import BackButton from '../../components/BackButton';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../constants/keyboard';
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
              Giấy tờ đã được dùng để duyệt kỹ năng thì không sửa hoặc xóa được nữa. Giấy tờ chưa dùng vẫn sửa hoặc xóa được.
            </Text>
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
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  primaryBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14, lineHeight: 20 },
});
