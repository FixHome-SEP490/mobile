// Chọn trụ sở + giờ lên gặp sau khi admin xác nhận danh tính (PO 09/11/2026).
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CalendarCheck, Info, MapPin, Phone } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';
import BackButton from '../../components/BackButton';
import ToneNote from '../../components/ToneNote';
import CalendarDateField from '../../components/CalendarDateField';
import { technicianOfficeVisitApi, type MyOfficeVisit } from '../../api/technician-office-visit.api';
import { extractApiErrorMessage } from '../../utils/input-validation';

const TZ = 'Asia/Ho_Chi_Minh';
// CalendarDateField trả dd/mm/yyyy nên so khớp bằng cùng định dạng (en-GB), giờ Việt Nam.
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const isoDayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export const formatVisitTime = (iso: string) => `${timeOf(iso)} ngày ${dayOf(iso)}`;

export default function TechnicianOfficeVisitScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<MyOfficeVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await technicianOfficeVisitApi.getMine();
      setData(res);
      setOfficeId((prev) => prev ?? res.offices.find((o) => o.recommended)?.id ?? res.offices[0]?.id ?? null);
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Không tải được lịch hẹn.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const office = data?.offices.find((o) => o.id === officeId);
  const slotsOfDay = useMemo(
    () => (office?.slots ?? []).filter((s) => s.remaining > 0 && dayOf(s.startsAt) === date),
    [office, date],
  );
  const firstFree = office?.slots.find((s) => s.remaining > 0);
  const freeDays = useMemo(() => new Set((office?.slots ?? []).filter((s) => s.remaining > 0).map((s) => isoDayOf(s.startsAt))), [office]);

  const goBack = () => (navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate('TechnicianOnboarding'));
  const call = (phone: string) => void Linking.openURL(`tel:${phone}`);

  const book = async () => {
    if (!officeId || !slot) return;
    setSaving(true);
    try {
      await technicianOfficeVisitApi.book(officeId, slot);
      setSlot(null);
      setChanging(false);
      await load();
    } catch (e) {
      Alert.alert('Không đặt được lịch', extractApiErrorMessage(e, 'Vui lòng chọn giờ khác.'));
      void load();
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(colors);
  const phoneBtn = (phone: string, label: string) => (
    <TouchableOpacity style={s.secondaryBtn} onPress={() => call(phone)} accessibilityRole="button" accessibilityLabel={label}>
      <Phone size={18} color={colors.text} />
      <Text style={s.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );

  const body = () => {
    if (loading) return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
    if (!data) {
      return <ToneNote tone="danger" icon={Info} alert>{error ?? 'Không tải được lịch hẹn.'}</ToneNote>;
    }
    if (data.blocked) {
      return (
        <View style={{ gap: 12 }}>
          <ToneNote tone="danger" icon={Info} alert>
            Bạn đã vắng {data.missedVisits} lần hẹn nên tạm thời không đặt thêm được. Vui lòng liên hệ quản lý dịch vụ để được hỗ trợ.
          </ToneNote>
          {data.supportPhone ? phoneBtn(data.supportPhone, `Gọi ${data.supportPhone}`) : null}
        </View>
      );
    }
    if (data.current && !changing) {
      return (
        <View style={{ gap: 12 }}>
          <View style={s.card}>
            <Text style={s.title}>Bạn đã đặt lịch</Text>
            <Text style={s.strong}>{formatVisitTime(data.current.scheduledAt)}</Text>
            <Text style={s.text}>{data.current.officeName}</Text>
            <Text style={s.muted}>{data.current.officeAddress}</Text>
          </View>
          <ToneNote tone="info" icon={Info}>Vui lòng mang bản công chứng bằng cấp và CCCD gốc để FixHome duyệt hồ sơ.</ToneNote>
          {data.current.officePhone ? phoneBtn(data.current.officePhone, 'Gọi trụ sở') : null}
          <TouchableOpacity style={s.secondaryBtn} onPress={() => setChanging(true)} accessibilityRole="button">
            <Text style={s.secondaryText}>Đổi giờ hẹn</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (data.offices.length === 0) {
      return <ToneNote tone="warning" icon={Info}>Hiện chưa có trụ sở nào nhận hồ sơ. Vui lòng quay lại sau.</ToneNote>;
    }
    return (
      <View style={{ gap: 16 }}>
        <ToneNote tone="info" icon={CalendarCheck}>
          Danh tính của bạn đã được xác nhận. Hãy chọn trụ sở và giờ lên gặp, nhớ mang bản công chứng bằng cấp.
          {data.missedVisits > 0 ? ` Bạn đã vắng ${data.missedVisits}/${data.maxMissedVisits} lần.` : ''}
        </ToneNote>
        <Text style={s.title}>1. Chọn trụ sở</Text>
        {data.offices.map((o) => {
          const active = o.id === officeId;
          return (
            <TouchableOpacity
              key={o.id}
              style={[s.card, active && { borderColor: colors.primaryStrong, borderWidth: 2 }]}
              onPress={() => { setOfficeId(o.id); setDate(''); setSlot(null); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${o.name}${o.recommended ? ', gần nhất' : ''}`}
            >
              <Text style={s.strong}>{o.name}{o.recommended ? '  · Gần nhất' : ''}</Text>
              <View style={s.row}>
                <MapPin size={16} color={colors.textSecondary} />
                <Text style={s.muted}>{o.address}</Text>
              </View>
              {o.distanceKm != null ? <Text style={s.muted}>Cách bạn khoảng {o.distanceKm.toFixed(1)} km</Text> : null}
            </TouchableOpacity>
          );
        })}
        <Text style={s.title}>2. Chọn ngày và giờ</Text>
        <CalendarDateField label="Ngày hẹn" isDateEnabled={(iso) => freeDays.has(iso)} value={date} onChange={(v) => { setDate(v); setSlot(null); }} />
        {!date && firstFree ? <Text style={s.muted}>Lịch trống gần nhất: {formatVisitTime(firstFree.startsAt)}</Text> : null}
        {date && slotsOfDay.length === 0 ? <Text style={s.muted}>Ngày này không còn giờ trống, vui lòng chọn ngày khác.</Text> : null}
        <View style={s.chipRow}>
          {slotsOfDay.map((sl) => {
            const active = slot === sl.startsAt;
            return (
              <TouchableOpacity
                key={sl.startsAt}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSlot(sl.startsAt)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.chipText, active && { color: '#FFFFFF' }]}>{timeOf(sl.startsAt)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[s.primaryBtn, (!slot || saving) && { opacity: 0.5 }]}
          disabled={!slot || saving}
          onPress={() => void book()}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Xác nhận lịch hẹn</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <BackButton onPress={goBack} />
        <Text style={s.headerTitle} accessibilityRole="header">Lịch lên trụ sở</Text>
        <View style={{ width: 44, height: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>{body()}</ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  strong: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 14, color: colors.text },
  muted: { fontSize: 14, color: colors.textSecondary, flexShrink: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, minWidth: 72, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  chipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  primaryBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong, paddingHorizontal: 16 },
  primaryText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn: { minHeight: 52, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16 },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
