import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';
import { technicianProfileApi, type TechnicianScheduleSlot, type TechnicianTimeOff } from '../../api/technician-profile.api';
import { replaceDaySchedule, timeOffPayload, validateSchedule } from './technician-availability';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { vnDateString } from '../../utils/vn-time';
import CalendarDateField from '../../components/CalendarDateField';

const DAYS = [{ day: 1, label: 'T2' }, { day: 2, label: 'T3' }, { day: 3, label: 'T4' }, { day: 4, label: 'T5' }, { day: 5, label: 'T6' }, { day: 6, label: 'T7' }, { day: 0, label: 'CN' }];
const PRESETS = [{ label: 'Sáng', startTime: '08:00', endTime: '12:00' }, { label: 'Chiều', startTime: '13:00', endTime: '18:00' }, { label: 'Cả ngày', startTime: '08:00', endTime: '18:00' }];

export default function TechnicianAvailabilityEditor({ onChanged }: { onChanged: () => void }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [slots, setSlots] = useState<TechnicianScheduleSlot[]>([]);
  const [savedSlots, setSavedSlots] = useState<TechnicianScheduleSlot[]>([]);
  const [leave, setLeave] = useState<TechnicianTimeOff[]>([]);
  const [day, setDay] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [copyPreview, setCopyPreview] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedule, timeOff] = await Promise.all([technicianProfileApi.getMySchedule(), technicianProfileApi.getMyTimeOff()]);
      if (!alive.current) return;
      setSlots(schedule); setSavedSlots(schedule); setLeave(timeOff); setLoaded(true); setDirty(false); setError('');
    } catch {
      if (alive.current) { setLoaded(false); setError('Không thể tải khung giờ và ngày nghỉ. Vui lòng thử lại.'); }
    } finally { if (alive.current) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server fetch, same pattern as profile
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);
  const mutate = async (operation: () => Promise<void>) => {
    if (lock.current || !loaded) return;
    lock.current = true; setBusy(true); setError('');
    try { await operation(); if (alive.current) onChanged(); }
    catch (err) { if (alive.current) setError(extractApiErrorMessage(err, 'Chưa lưu được thay đổi. Kiểm tra kết nối rồi thử lại.')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const selected = slots.filter(slot => slot.dayOfWeek === day);
  const editDay = (intervals: { startTime: string; endTime: string }[]) => {
    if (day === null || lock.current) return;
    setSlots(previous => replaceDaySchedule(previous, day, intervals)); setDirty(true); setCopyPreview(false);
  };
  const changeInterval = (index: number, field: 'startTime' | 'endTime', value: string) => editDay(selected.map((slot, i) => i === index ? { ...slot, [field]: value } : slot));
  const intervalSummary = (intervals: TechnicianScheduleSlot[]) => intervals.length
    ? intervals.map(slot => slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : 'Chưa nhập đủ giờ').join(' · ')
    : 'Nghỉ';
  return <View style={styles.section}>
    <Text style={styles.title} accessibilityRole="header">Tuần làm việc</Text>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {loading ? <ActivityIndicator color={colors.primaryStrong} /> : !loaded ? <TouchableOpacity style={styles.secondary} onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>Thử lại</Text></TouchableOpacity> : <>
      {!savedSlots.length && !dirty && <View style={styles.empty}>
        <Text style={styles.hint}>Bạn chưa thiết lập lịch nhận việc. Chọn ngày và khung giờ phù hợp rồi lưu.</Text>
        <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => setDay(1)}><Text style={styles.link}>Thiết lập lịch nhận việc</Text></TouchableOpacity>
      </View>}
      <Text style={styles.hint}>{dirty ? 'Bản nháp chưa lưu. Lịch nhận việc chỉ thay đổi khi bạn nhấn Lưu.' : 'Chạm một ngày để chỉnh sửa lịch đã lưu.'}</Text>
      <View style={styles.week}>
        {DAYS.map(item => <View key={item.day}>
          <TouchableOpacity style={[styles.day, item.day === day && styles.dayOn]} disabled={busy} onPress={() => { setDay(day === item.day ? null : item.day); setCopyPreview(false); }} accessibilityRole="button" accessibilityLabel={`Khung giờ ${item.label}`} accessibilityState={{ expanded: item.day === day, disabled: busy }}>
            <Text style={styles.dayLabel}>{item.label}</Text>
            <Text style={[styles.hint, styles.summary]}>{intervalSummary(slots.filter(slot => slot.dayOfWeek === item.day))}</Text>
            <Text style={styles.link}>{item.day === day ? 'Đóng' : 'Sửa'}</Text>
          </TouchableOpacity>
          {item.day === day && <View style={styles.editor}>
            <Text style={styles.editorTitle}>Chỉnh sửa {item.label}</Text>
            <Text style={styles.hint}>Gợi ý khung giờ</Text>
            <View style={styles.row}>{PRESETS.map(preset => <TouchableOpacity key={preset.label} style={styles.secondary} disabled={busy} accessibilityRole="button" accessibilityLabel={`${preset.label} ${preset.startTime}–${preset.endTime}`} onPress={() => editDay([{ startTime: preset.startTime, endTime: preset.endTime }])}><Text style={styles.link}>{preset.label}</Text></TouchableOpacity>)}</View>
            <Text style={styles.hint}>Tùy chỉnh giờ (HH:mm)</Text>
            {selected.map((slot, index) => <View key={index} style={styles.interval}>
              <View style={styles.row}>
                <View style={styles.flex}><Text style={styles.hint}>Từ</Text><TextInput style={styles.input} value={slot.startTime} onChangeText={value => changeInterval(index, 'startTime', value)} editable={!busy} keyboardType="numbers-and-punctuation" accessibilityLabel={`Giờ bắt đầu khung ${index + 1}`} placeholder="HH:mm" placeholderTextColor={colors.muted} /></View>
                <View style={styles.flex}><Text style={styles.hint}>Đến</Text><TextInput style={styles.input} value={slot.endTime} onChangeText={value => changeInterval(index, 'endTime', value)} editable={!busy} keyboardType="numbers-and-punctuation" accessibilityLabel={`Giờ kết thúc khung ${index + 1}`} placeholder="HH:mm" placeholderTextColor={colors.muted} /></View>
              </View>
              <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" accessibilityLabel={`Xóa khung giờ ${index + 1}`} onPress={() => editDay(selected.filter((_, i) => i !== index))}><Text style={styles.link}>Xóa khung giờ</Text></TouchableOpacity>
            </View>)}
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => editDay([...selected, { startTime: '', endTime: '' }])}><Text style={styles.link}>Thêm khung giờ</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => editDay([])}><Text style={styles.link}>Nghỉ ngày này</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => {
              const invalid = validateSchedule(selected); if (invalid) { setError(invalid); return; } setCopyPreview(true);
            }}><Text style={styles.link}>Áp dụng T2–T6</Text></TouchableOpacity>
            {copyPreview && <View style={styles.empty}>
              <Text style={styles.editorTitle}>Bản xem trước T2–T6</Text>
              <Text style={styles.hint}>{intervalSummary(selected)}. Thay thế khung giờ T2–T6; giữ nguyên T7 và CN. Chưa gửi lên hệ thống.</Text>
              <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => {
                if (lock.current) return;
                setSlots(previous => [1, 2, 3, 4, 5].reduce((draft, target) => replaceDaySchedule(draft, target, selected), previous));
                setDirty(true); setCopyPreview(false);
              }}><Text style={styles.link}>Xác nhận bản nháp T2–T6</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" onPress={() => setCopyPreview(false)}><Text style={styles.link}>Hủy sao chép</Text></TouchableOpacity>
            </View>}
          </View>}
        </View>)}
      </View>
      {(day !== null || dirty) && <TouchableOpacity style={[styles.primary, busy && styles.disabled]} disabled={busy} accessibilityState={{ disabled: busy, busy }} accessibilityRole="button" accessibilityLabel="Lưu khung giờ" onPress={() => {
        const invalid = validateSchedule(slots); if (invalid) { setError(invalid); return; }
        void mutate(async () => {
          const saved = await technicianProfileApi.updateMySchedule(slots);
          if (alive.current) { setSlots(saved); setSavedSlots(saved); setDirty(false); setDay(null); setCopyPreview(false); }
        });
      }}><Text style={styles.primaryText}>{busy ? 'Đang lưu…' : 'Lưu lịch làm việc'}</Text></TouchableOpacity>}
      <Text style={[styles.title, { marginTop: 12 }]} accessibilityRole="header">Ngày nghỉ & thay đổi tạm thời</Text>
      <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" accessibilityLabel="Khai báo ngày nghỉ" accessibilityState={{ expanded: leaveOpen, disabled: busy }} onPress={() => setLeaveOpen(!leaveOpen)}><Text style={styles.link}>{leaveOpen ? 'Đóng khai báo' : 'Khai báo ngày nghỉ'}</Text></TouchableOpacity>
      {leaveOpen && <View style={styles.editor}>
        <Text style={styles.hint}>Nghỉ trọn ngày trong khoảng đã chọn.</Text>
        <CalendarDateField label="Ngày bắt đầu" value={start} onChange={setStart} disabled={busy} />
        <CalendarDateField label="Ngày kết thúc" value={end} onChange={setEnd} disabled={busy} />
        <Text style={styles.hint}>Lý do (không bắt buộc)</Text>
        <TextInput style={styles.input} value={reason} onChangeText={setReason} editable={!busy} accessibilityLabel="Lý do ngày nghỉ" placeholderTextColor={colors.muted} />
        <TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" accessibilityLabel="Thêm ngày nghỉ" onPress={() => {
          const payload = timeOffPayload(start, end, reason); if (!payload) { setError('Chọn ngày hợp lệ; ngày kết thúc phải sau hoặc trùng ngày bắt đầu.'); return; }
          void mutate(async () => {
            const saved = await technicianProfileApi.createTimeOff(payload);
            if (alive.current) { setLeave(previous => [...previous, saved]); setStart(''); setEnd(''); setReason(''); setLeaveOpen(false); }
          });
        }}><Text style={styles.link}>Thêm ngày nghỉ</Text></TouchableOpacity>
      </View>}
      {!leave.length && <Text style={styles.hint}>Chưa có ngày nghỉ đã khai báo.</Text>}
      {leave.map(item => <View key={item.id} style={styles.row}><Text style={[styles.hint, styles.flex]}>{vnDateString(item.startAt)} – {vnDateString(item.endAt)}{item.reason ? ` · ${item.reason}` : ''}</Text><TouchableOpacity style={styles.secondary} disabled={busy} accessibilityRole="button" accessibilityLabel="Xóa ngày nghỉ" onPress={() => Alert.alert('Xóa ngày nghỉ?', 'Bạn có thể nhận việc trở lại trong khoảng ngày này.', [{ text: 'Giữ lại', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void mutate(async () => { await technicianProfileApi.deleteTimeOff(item.id); if (alive.current) setLeave(previous => previous.filter(value => value.id !== item.id)); }) }])}><Text style={styles.link}>Xóa</Text></TouchableOpacity></View>)}
    </>}
  </View>;
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  section: { gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: colors.text },
  editorTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  error: { color: colors.tone.danger.text, fontSize: 14, lineHeight: 20 },
  week: { gap: 8 },
  day: { minHeight: 56, padding: 12, borderRadius: 12, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayOn: { backgroundColor: colors.primarySoft },
  dayLabel: { minWidth: 28, fontSize: 16, fontWeight: '600', color: colors.text },
  summary: { flex: 1, minWidth: 0, flexShrink: 1 },
  editor: { paddingVertical: 12, gap: 12 },
  empty: { gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.background },
  interval: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 80 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text },
  secondary: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.primarySoft },
  link: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  primary: { minHeight: 48, backgroundColor: colors.primaryStrong, borderRadius: 12, justifyContent: 'center', alignItems: 'center', padding: 12 },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
