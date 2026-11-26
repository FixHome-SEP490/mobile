import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { ChevronDown, ChevronRight, ChevronUp, FileText, Search } from 'lucide-react-native';
import { servicesApi, type CategoryItem, type ServiceItem } from '../../api/services.api';
import { technicianProfileApi, type TechnicianServiceOffering } from '../../api/technician-profile.api';
import BackButton from '../../components/BackButton';
import PillText from '../../components/PillText';
import StatusBadge from '../../components/StatusBadge';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../constants/keyboard';
import { iconStroke, useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import SkillEvidenceRow from './SkillEvidenceRow';
import StagedSkillPapers from './StagedSkillPapers';
import { SKILL_STATUS_LABEL, sendStagedSkillPapers, type StagedSkillPaper } from './skill-evidence';
import { readSkillPricing, skillDigitsOnly } from './skill-pricing-input';
import {
  SKILL_FILTERS,
  buildSkillDrafts,
  countSkills,
  groupSkills,
  groupSummary,
  isFixedPriceService,
  isSkillDirty,
  skillStateOf,
  type SkillDraft,
  type SkillFilter,
} from './technician-skills';
import type { StatusView } from './technician-status';

const STATUS_VIEW: Record<'pending' | 'verified' | 'rejected', StatusView> = {
  pending: { label: SKILL_STATUS_LABEL.pending, tone: 'warning', icon: 'Clock' },
  verified: { label: SKILL_STATUS_LABEL.verified, tone: 'success', icon: 'CheckCircle2' },
  rejected: { label: SKILL_STATUS_LABEL.rejected, tone: 'danger', icon: 'XCircle' },
};

/**
 * The technician's own page for the services they take (replaces the short sheet on the Profile screen): every service
 * of the catalog by category with its approval state, the price and warranty to list, the reason a skill was refused,
 * and the papers sent for them. A service switched on here waits for the service manager before it can be booked.
 */
export default function TechnicianSkillsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [offerings, setOfferings] = useState<Record<string, TechnicianServiceOffering>>({});
  const [drafts, setDrafts] = useState<Record<string, SkillDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<SkillFilter>('all');
  const [query, setQueryState] = useState('');
  const [open, setOpen] = useState<string[]>([]);
  // While a filter or a search is on, the matching groups start open; the ones the technician closes are kept here, so they can still be folded.
  const [folded, setFolded] = useState<string[]>([]);
  const setFilter = (next: SkillFilter) => { setFilterState(next); setFolded([]); };
  const setQuery = (next: string) => { setQueryState(next); setFolded([]); };
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // Giấy tờ chọn trước cho kỹ năng chưa đăng ký: gửi cùng lúc lưu, vì backend mở phiếu duyệt ngay khi lưu.
  const [staged, setStaged] = useState<Record<string, StagedSkillPaper[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, cats, mine, profile] = await Promise.all([
        servicesApi.getServices({ pageSize: 100 }),
        servicesApi.getCategories(),
        technicianProfileApi.getMyServices(),
        technicianProfileApi.getMyProfile().catch(() => null),
      ]);
      const byId = Object.fromEntries(mine.map((o) => [o.serviceId, o]));
      setServices(catalog.data);
      setCategories(cats);
      setOfferings(byId);
      setDrafts(buildSkillDrafts(catalog.data, byId, profile?.defaultLaborWarrantyDays ?? 30));
    } catch {
      // A failed request is not an empty catalog.
      setError('Không thể tải danh sách dịch vụ. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const refreshOfferings = useCallback(() => {
    technicianProfileApi.getMyServices()
      .then((list) => setOfferings(Object.fromEntries(list.map((o) => [o.serviceId, o]))))
      .catch(() => undefined);
  }, []);

  const save = async (service: ServiceItem) => {
    const draft = drafts[service.id];
    if (!draft) return;
    const isFixedPrice = isFixedPriceService(service);
    const pricing = readSkillPricing(draft, isFixedPrice);
    if ('error' in pricing) {
      Alert.alert('Chưa lưu được', pricing.error);
      return;
    }
    setSavingId(service.id);
    try {
      const offering = await technicianProfileApi.setSkillPricing(service.id, {
        isActive: draft.enabled,
        typicalWarrantyDays: pricing.values.typicalWarrantyDays,
        listedLaborPrice: isFixedPrice ? null : pricing.values.listedLaborPrice,
      });
      setOfferings((prev) => ({ ...prev, [service.id]: offering }));
      const waiting = draft.enabled ? (staged[service.id] ?? []) : [];
      setStaged((prev) => ({ ...prev, [service.id]: [] }));
      if (waiting.length) {
        const { failed, reason } = await sendStagedSkillPapers(service.id, waiting);
        if (failed > 0) Alert.alert('Đã lưu kỹ năng', `${failed} giấy tờ chưa gửi được${reason ? `: ${reason}` : ''}. Bạn có thể thêm lại ở mục giấy tờ của kỹ năng.`);
        refreshOfferings();
      }
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu kỹ năng này.'));
    } finally {
      setSavingId(null);
    }
  };

  const resubmit = async (service: ServiceItem) => {
    setResendingId(service.id);
    setNotice('');
    try {
      await technicianProfileApi.resubmitSkill(service.id);
      refreshOfferings();
      setNotice(`Đã gửi lại ${service.name}. FixHome sẽ xét duyệt và báo cho bạn.`);
    } catch (err: unknown) {
      Alert.alert('Chưa gửi lại được', extractApiErrorMessage(err, 'Vui lòng thử lại.'));
    } finally {
      setResendingId(null);
    }
  };

  const counts = useMemo(() => countSkills(services, offerings), [services, offerings]);
  const groups = useMemo(() => groupSkills(services, categories, offerings, filter, query), [services, categories, offerings, filter, query]);
  const searching = filter !== 'all' || query.trim() !== '';
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const toggleGroup = (id: string) => (searching ? setFolded((prev) => flip(prev, id)) : setOpen((prev) => flip(prev, id)));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle} accessibilityRole="header">Kỹ năng và dịch vụ</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primaryStrong} />
        ) : error ? (
          <View style={styles.errorBlock} accessibilityRole="alert">
            <Text style={styles.hint}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Thử lại danh sách dịch vụ" onPress={() => void load()} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.note}>
              Bật dịch vụ bạn nhận làm. Dịch vụ mới hoặc bật lại cần quản lý dịch vụ duyệt trước khi nhận được việc.
            </Text>

            {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.noticeOk} testID="skills-notice">{notice}</Text>}

            <View style={styles.search}>
              <Search size={18} strokeWidth={iconStroke} color={colors.textSecondary} />
              <TextInput
                testID="skills-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm dịch vụ"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Tìm dịch vụ"
                style={styles.searchInput}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {SKILL_FILTERS.map(({ key, label }) => {
                const selected = filter === key;
                return (
                  <Pressable
                    key={key}
                    testID={`skills-filter-${key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${counts[key]} dịch vụ`}
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(key)}
                    style={[styles.filter, selected && styles.filterOn]}
                  >
                    <PillText style={[styles.filterText, selected && styles.filterTextOn]}>{`${label} ${counts[key]}`}</PillText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {groups.length === 0 && <Text style={styles.hint}>Không có dịch vụ nào khớp.</Text>}
            {groups.map((group) => {
              const expanded = searching ? !folded.includes(group.id) : open.includes(group.id);
              const Chevron = expanded ? ChevronUp : ChevronDown;
              return (
                <View key={group.id} style={styles.group} testID={`skills-group-${group.id}`}>
                  <Pressable
                    testID={`skills-group-header-${group.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.name}, ${groupSummary(group, offerings)}`}
                    accessibilityState={{ expanded }}
                    onPress={() => toggleGroup(group.id)}
                    style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
                  >
                    <View style={styles.groupText}>
                      <Text style={styles.groupName}>{group.name}</Text>
                      <Text style={styles.hint}>{groupSummary(group, offerings)}</Text>
                    </View>
                    <Chevron size={20} strokeWidth={iconStroke} color={colors.textSecondary} />
                  </Pressable>
                  {expanded && group.services.map((service) => (
                    <SkillRow
                      key={service.id}
                      service={service}
                      offering={offerings[service.id]}
                      draft={drafts[service.id]}
                      saving={savingId === service.id}
                      onDraft={(patch) => {
                        setDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], ...patch } }));
                        if (patch.enabled === false) setStaged((prev) => ({ ...prev, [service.id]: [] }));
                      }}
                      staged={staged[service.id] ?? []}
                      onStaged={(items) => setStaged((prev) => ({ ...prev, [service.id]: items }))}
                      onSave={() => void save(service)}
                      resending={resendingId === service.id}
                      onResubmit={() => void resubmit(service)}
                      onPapersChanged={refreshOfferings}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                </View>
              );
            })}

            <Pressable
              testID="skills-open-evidence"
              accessibilityRole="button"
              accessibilityLabel="Giấy tờ chứng minh tay nghề"
              onPress={() => navigation.navigate('TechnicianEvidence')}
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <FileText size={20} strokeWidth={iconStroke} color={colors.primaryStrong} />
              <View style={styles.groupText}>
                <Text style={styles.groupName}>Giấy tờ chứng minh tay nghề</Text>
                <Text style={styles.hint}>Xem, thêm, sửa giấy tờ đã nộp</Text>
              </View>
              <ChevronRight size={20} strokeWidth={iconStroke} color={colors.textSecondary} />
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SkillRow({ service, offering, draft, saving, resending, onDraft, staged, onStaged, onSave, onResubmit, onPapersChanged, styles, colors }: {
  service: ServiceItem;
  offering: TechnicianServiceOffering | undefined;
  draft: SkillDraft | undefined;
  saving: boolean;
  resending: boolean;
  onDraft: (patch: Partial<SkillDraft>) => void;
  staged: StagedSkillPaper[];
  onStaged: (items: StagedSkillPaper[]) => void;
  onSave: () => void;
  onResubmit: () => void;
  onPapersChanged: () => void;
  styles: ReturnType<typeof getStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  if (!draft) return null;
  const isFixedPrice = isFixedPriceService(service);
  const state = skillStateOf(offering);
  const dirty = isSkillDirty(draft, offering, isFixedPrice);
  return (
    <View style={styles.row} testID={`skill-row-${service.id}`}>
      <View style={styles.rowHeader}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowName} numberOfLines={2}>{service.name}</Text>
          {state !== 'none' && <StatusBadge view={STATUS_VIEW[state]} />}
        </View>
        <Switch
          testID={`skill-switch-${service.id}`}
          value={draft.enabled}
          onValueChange={(enabled) => onDraft({ enabled })}
          trackColor={{ false: colors.border, true: colors.primaryStrong }}
          thumbColor={colors.surface}
          {...{ activeThumbColor: colors.surface }} // react-native-web: the default thumb when on is teal
          accessibilityRole="switch"
          accessibilityLabel={`Nhận làm ${service.name}`}
          accessibilityState={{ checked: draft.enabled }}
        />
      </View>
      {draft.enabled && (
        <View style={styles.fields}>
          {!isFixedPrice && (
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Giá công (₫)</Text>
              <TextInput
                value={draft.listedLaborPrice}
                onChangeText={(v) => onDraft({ listedLaborPrice: skillDigitsOnly(v) })}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="Nhập giá công"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={`Giá công ${service.name}`}
                style={styles.input}
              />
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>Bảo hành (ngày)</Text>
            <TextInput
              value={draft.typicalWarrantyDays}
              onChangeText={(v) => onDraft({ typicalWarrantyDays: skillDigitsOnly(v) })}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="Số ngày"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={`Bảo hành ${service.name}`}
              style={styles.input}
            />
          </View>
        </View>
      )}
      {draft.enabled && state === 'none' && (
        <StagedSkillPapers serviceId={service.id} serviceName={service.name} items={staged} onChange={onStaged} />
      )}
      {offering?.isActive && state !== 'verified' && state !== 'none' && (
        <SkillEvidenceRow serviceId={service.id} serviceName={service.name} status={state} onChanged={onPapersChanged} showReasonNow />
      )}
      {state === 'rejected' && offering?.isActive && !dirty && (
        <View style={styles.resend}>
          <Text style={styles.label}>Xóa giấy tờ không phù hợp hoặc thêm giấy tờ mới nếu cần, rồi gửi lại. Giấy tờ còn lại đi kèm yêu cầu mới.</Text>
          <Pressable
            testID={`skill-resubmit-${service.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Gửi lại ${service.name} để xét duyệt`}
            accessibilityState={{ disabled: resending, busy: resending }}
            disabled={resending}
            onPress={onResubmit}
            style={styles.primaryBtn}
          >
            {resending ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Gửi lại để xét duyệt</Text>}
          </Pressable>
        </View>
      )}
      {dirty && (
        <Pressable
          testID={`skill-save-${service.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Lưu ${service.name}`}
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          onPress={onSave}
          style={styles.primaryBtn}
        >
          {saving ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Lưu thay đổi</Text>}
        </Pressable>
      )}
    </View>
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
  note: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  noticeOk: { color: colors.tone.success.text, backgroundColor: colors.tone.success.bg, borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20 },
  resend: { gap: 8 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, minHeight: 44, color: colors.text, fontSize: 16 },
  filters: { gap: 8, paddingRight: 8 },
  filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  filterText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  filterTextOn: { color: colors.surface },
  group: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  groupHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  groupText: { flex: 1, minWidth: 0, gap: 2 },
  groupName: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  row: { gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowTitle: { flex: 1, minWidth: 0, gap: 6, alignItems: 'flex-start' },
  rowName: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, minWidth: 0 },
  fieldWide: { flex: 1, minWidth: 0 },
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500', marginBottom: 4 },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  primaryBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  link: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { opacity: 0.8 },
});
