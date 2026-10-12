import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import { vnParts } from '../utils/vn-time';
import { parseVnDateInput } from '../utils/format';

export default function CalendarDateField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => { const p = vnParts(Date.now()); return new Date(Date.UTC(p.year, p.month - 1, 1)); });
  const year = month.getUTCFullYear(), monthIndex = month.getUTCMonth();
  const start = (month.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const selected = parseVnDateInput(value);
  const show = () => {
    if (selected) { const [y, m] = selected.split('-').map(Number); setMonth(new Date(Date.UTC(y, m - 1, 1))); }
    setOpen(true);
  };
  return <View>
    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    <TouchableOpacity style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={show} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'Chọn ngày'}`}>
      <Text style={{ color: colors.text }}>{value || 'Chọn ngày'}</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.scrim}>
        <View style={[styles.panel, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <View style={styles.row}><Text style={[styles.heading, { color: colors.text }]}>{label}</Text><TouchableOpacity style={styles.target} onPress={() => setOpen(false)} accessibilityLabel="Đóng lịch" accessibilityRole="button"><X color={colors.text} size={24} /></TouchableOpacity></View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.target} accessibilityRole="button" accessibilityLabel="Tháng trước" onPress={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)))}><ChevronLeft size={24} color={colors.text} /></TouchableOpacity>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{monthIndex + 1}/{year}</Text>
            <TouchableOpacity style={styles.target} accessibilityRole="button" accessibilityLabel="Tháng sau" onPress={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)))}><ChevronRight size={24} color={colors.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 360 }}><View style={styles.grid}>
            {['T2','T3','T4','T5','T6','T7','CN'].map(day => <Text key={day} style={[styles.cell, { color: colors.textSecondary, textAlign: 'center', paddingTop: 12 }]}>{day}</Text>)}
            {Array.from({ length: start }, (_, i) => <View key={`blank-${i}`} style={styles.cell} />)}
            {Array.from({ length: count }, (_, i) => {
              const day = i + 1;
              const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const active = selected === iso;
              return <TouchableOpacity key={day} style={[styles.cell, { backgroundColor: active ? colors.primaryStrong : colors.surface, borderRadius: 8 }]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${day}/${monthIndex + 1}/${year}`} onPress={() => { onChange(`${String(day).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${year}`); setOpen(false); }}><Text style={{ color: active ? colors.surface : colors.text }}>{day}</Text></TouchableOpacity>;
            })}
          </View></ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ label: { fontSize: 14, fontWeight: '600', marginBottom: 8 }, field: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, justifyContent: 'center' }, scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }, panel: { padding: 12, borderRadius: 20, width: '100%', maxWidth: 420, alignSelf: 'center' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, target: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, heading: { fontSize: 20, fontWeight: '600' }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: `${100 / 7}%`, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
