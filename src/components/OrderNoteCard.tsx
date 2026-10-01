import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import { useAuthStore } from '../store/auth.store';
import { NOTE_MAX_LENGTH, loadNote, saveNote } from '../screens/technician/technician-notes';

/** Private note for one order, kept on this device only. */
export default function OrderNoteCard({ orderId }: { orderId: string }) {
  const { colors } = useAppTheme();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadNote(userId, orderId).then((text) => {
      if (!alive) return;
      setSaved(text);
      setDraft(text);
    });
    return () => {
      alive = false;
    };
  }, [userId, orderId]);

  const dirty = draft.trim() !== saved;

  const onSave = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setError(false);
    const ok = await saveNote(userId, orderId, draft);
    setBusy(false);
    if (ok) {
      const value = draft.trim();
      setSaved(value);
      setDraft(value);
      setJustSaved(true);
    } else {
      setError(true);
    }
  };

  const s = getStyles(colors);
  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Text style={s.title}>Ghi chú riêng</Text>
        <View style={s.lockRow}>
          <Lock size={14} color={colors.textSecondary} strokeWidth={1.75} />
          <Text style={s.caption}>Chỉ mình bạn thấy</Text>
        </View>
      </View>
      <TextInput
        style={s.input}
        value={draft}
        onChangeText={(t) => {
          setDraft(t);
          setJustSaved(false);
        }}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Ví dụ: nhà ở hẻm nhỏ, khách có thú cưng, cần mang thang…"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Ghi chú riêng cho đơn này"
        textAlignVertical="top"
      />
      <Text style={s.caption}>
        Ghi chú lưu trên thiết bị này, không gửi cho khách hàng hay hệ thống.
      </Text>
      {error && <Text style={s.error} accessibilityRole="alert">Không lưu được ghi chú. Vui lòng thử lại.</Text>}
      <TouchableOpacity
        style={[s.btn, (!dirty || busy) && s.btnDisabled]}
        onPress={onSave}
        disabled={!dirty || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !dirty || busy, busy }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <Text style={s.btnText}>{justSaved && !dirty ? 'Đã lưu' : 'Lưu ghi chú'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  input: {
    minHeight: 96,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.error },
  btn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.surface, fontSize: 16, lineHeight: 24, fontWeight: '600' },
});
