import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import BackButton from '../../components/BackButton';
import { vouchersApi, type GeneralVoucher, type VoucherClaim } from '../../api/vouchers.api';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  claimState, conditionLabel, discountLabel, isVoucherCode, splitWallet, unsavedGeneral, voucherDate,
  VOUCHER_EMPTY, VOUCHER_SAVED_NOTE, VOUCHER_TABS, type VoucherTab,
} from './voucher-view';

type Row = { key: string; title: string; discount: string; condition: string; expires: string; badge: string; claimCode?: string };

const walletRow = (claim: VoucherClaim): Row => ({
  key: claim.id, title: claim.campaign.name, discount: discountLabel(claim.policy), condition: conditionLabel(claim.policy),
  expires: voucherDate(claim.campaign.endsAt), badge: claimState(claim).label,
});
const generalRow = (voucher: GeneralVoucher): Row => ({
  key: voucher.id, title: voucher.name, discount: discountLabel(voucher.policy), condition: conditionLabel(voucher.policy),
  expires: voucherDate(voucher.endsAt), badge: 'Chưa lưu', claimCode: voucher.code,
});

/** The customer's voucher wallet (web #175): save a code, browse the general offers, see what was used. Saving applies nothing. */
export default function CustomerVouchersScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [tab, setTab] = useState<VoucherTab>('mine');
  const [wallet, setWallet] = useState<VoucherClaim[] | null>(null);
  const [general, setGeneral] = useState<GeneralVoucher[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (mode: 'first' | 'refresh' = 'first') => {
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const [claims, offers] = await Promise.all([vouchersApi.wallet(), vouchersApi.general()]);
      setWallet(claims);
      setGeneral(offers);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Chưa tải được ví ưu đãi. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const claim = async (value: string) => {
    if (busy || !isVoucherCode(value)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await vouchersApi.claim(value);
      setCode('');
      setFeedback({ ok: true, text: VOUCHER_SAVED_NOTE });
      await load('refresh');
    } catch (err) {
      setFeedback({ ok: false, text: extractApiErrorMessage(err, 'Chưa lưu được ưu đãi. Vui lòng kiểm tra mã rồi thử lại.') });
    } finally {
      setBusy(false);
    }
  };

  const rows: Row[] = useMemo(() => {
    if (!wallet || !general) return [];
    const { mine, history } = splitWallet(wallet);
    if (tab === 'general') return unsavedGeneral(general, wallet).map(generalRow);
    return (tab === 'mine' ? mine : history).map(walletRow);
  }, [tab, wallet, general]);

  const empty = VOUCHER_EMPTY[tab];
  const codeReady = isVoucherCode(code) && !busy;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <BackButton />
        <Text accessibilityRole="header" style={styles.headerTitle}>Ưu đãi của tôi</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={loading || error ? [] : rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
          ListHeaderComponent={(
            <View style={styles.headerBlock}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Bạn có mã ưu đãi?</Text>
                <Text style={styles.hint}>Nhập mã ưu đãi chung để lưu vào ví. Mỗi khách chỉ lưu một lần cho mỗi chương trình.</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={40}
                  placeholder="Nhập mã ưu đãi"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Mã ưu đãi"
                  editable={!busy}
                  returnKeyType="done"
                  onSubmitEditing={() => void claim(code)}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, !codeReady && styles.disabled]}
                  disabled={!codeReady}
                  onPress={() => void claim(code)}
                  accessibilityRole="button"
                  accessibilityLabel="Lưu mã vào ví"
                  accessibilityState={{ disabled: !codeReady }}
                >
                  <Text style={styles.primaryText}>{busy ? 'Đang lưu…' : 'Lưu vào ví'}</Text>
                </TouchableOpacity>
              </View>
              {feedback && (
                <Text style={[styles.hint, { color: feedback.ok ? colors.tone.success.text : colors.tone.danger.text }]} accessibilityRole={feedback.ok ? undefined : 'alert'} testID="voucher-feedback">
                  {feedback.text}
                </Text>
              )}
              <View style={styles.tabs} accessibilityRole="tablist">
                {VOUCHER_TABS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.tab, tab === item.key && styles.tabActive]}
                    onPress={() => setTab(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === item.key }}
                    accessibilityLabel={item.label}
                  >
                    <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.card} testID="voucher-row">
              <View style={styles.row}>
                <Text style={[styles.cardTitle, styles.flex]} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.badge}>{item.badge}</Text>
              </View>
              <Text style={styles.discount}>{item.discount}</Text>
              <Text style={styles.hint}>{item.condition}</Text>
              <Text style={styles.hint}>Hạn dùng: {item.expires}</Text>
              {!!item.claimCode && (
                <TouchableOpacity
                  style={[styles.secondaryBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => void claim(item.claimCode!)}
                  accessibilityRole="button"
                  accessibilityLabel={`Lưu ưu đãi ${item.title} vào ví`}
                >
                  <Text style={styles.secondaryText}>Lưu vào ví</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.error} accessibilityRole="alert">{error}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => { setLoading(true); void load(); }} accessibilityRole="button">
                <Text style={styles.primaryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.center} testID="voucher-empty">
              <Text style={styles.cardTitle}>{empty.title}</Text>
              <Text style={styles.hint}>{empty.message}</Text>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  headerTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  headerBlock: { gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discount: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.primaryStrong },
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  error: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primaryTint },
  tabText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  tabTextActive: { color: colors.primaryStrong, fontWeight: '700' },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
