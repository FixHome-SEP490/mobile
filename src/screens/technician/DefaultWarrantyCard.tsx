import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';

export const MAX_WARRANTY_DAYS = 365;

/** "Bảo hành công mặc định": used by every service that has no warranty of its own; each order snapshots it on assignment. */
export default function DefaultWarrantyCard({ saved, onSaved }: { saved: number | null; onSaved: (days: number) => void }) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(saved == null ? '' : String(saved));
  const [toAll, setToAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const days = Number(draft);
  const valid = draft !== '' && Number.isInteger(days) && days >= 0 && days <= MAX_WARRANTY_DAYS;
  const dirty = toAll || draft !== (saved == null ? '' : String(saved));

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await technicianProfileApi.setDefaultLaborWarranty(days, toAll);
      onSaved(days);
      Alert.alert('Đã lưu', toAll ? `Đã đặt bảo hành ${days} ngày cho mọi dịch vụ.` : `Đã đặt bảo hành mặc định ${days} ngày.`);
      setToAll(false);
    } catch (err: unknown) {
      Alert.alert('Chưa lưu được', extractApiErrorMessage(err, 'Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View testID="default-warranty-card" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Bảo hành công mặc định</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Áp dụng cho dịch vụ chưa có số ngày riêng. Tối đa {MAX_WARRANTY_DAYS} ngày; đơn lưu lại số ngày này khi bạn được giao.
      </Text>
      <View style={styles.row}>
        <TextInput
          testID="default-warranty-input"
          accessibilityLabel="Số ngày bảo hành mặc định"
          value={draft}
          onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="30"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { borderColor: valid || draft === '' ? colors.border : colors.error, color: colors.text }]}
        />
        <Text style={{ color: colors.text }}>ngày</Text>
      </View>
      <View style={styles.row}>
        <Switch testID="default-warranty-all" value={toAll} onValueChange={setToAll} accessibilityLabel="Áp dụng cho mọi dịch vụ" />
        <Text style={[styles.hint, { color: colors.textSecondary, flex: 1 }]}>Áp dụng cho mọi dịch vụ (ghi đè số ngày riêng)</Text>
      </View>
      {dirty && (
        <Pressable
          testID="default-warranty-save"
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || saving, busy: saving }}
          disabled={!valid || saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: !valid || saving ? 0.6 : pressed ? 0.8 : 1 }]}
        >
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={[styles.btnText, { color: colors.surface }]}>Lưu mặc định</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { minWidth: 80, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  btn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16, alignSelf: 'flex-start' },
  btnText: { fontWeight: '700' },
});
