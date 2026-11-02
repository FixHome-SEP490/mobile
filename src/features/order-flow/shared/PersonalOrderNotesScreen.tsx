import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { loadNote, NOTE_MAX_LENGTH, saveNote } from '../../../screens/technician/technician-notes';
import { ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { backFromFlow } from '../navigation/resume-order';

export default function PersonalOrderNotesScreen() {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();
  const userId = key?.role === 'technician' && snapshot?.access === 'current' ? key.userId : null;
  const orderId = key?.serviceOrderId;
  const identity = userId && orderId ? `${key?.role}:${userId}:${key?.sessionGeneration}:${orderId}` : '';
  const physicalIdentity = userId && orderId ? `${userId}:${orderId}` : '';
  const [stored, setStored] = useState<{ identity: string; note: string; state: 'ready' | 'saved' | 'saving' | 'error' }>({ identity: '', note: '', state: 'ready' });
  const identityRef = useRef(identity);
  const saveSequence = useRef(0);
  const draftSequence = useRef(0);
  const busyPhysicalIdentities = useRef(new Set<string>());
  const [activeSaves, setActiveSaves] = useState<ReadonlySet<string>>(new Set());
  const mounted = useRef(false);
  useLayoutEffect(() => {
    identityRef.current = identity;
    saveSequence.current += 1;
    draftSequence.current += 1;
  }, [identity]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (!userId || !orderId) return () => { active = false; mounted.current = false; saveSequence.current += 1; };
    void loadNote(userId, orderId).then(value => { if (active) setStored({ identity, note: value, state: 'ready' }); });
    return () => { active = false; mounted.current = false; saveSequence.current += 1; };
  }, [userId, orderId, identity]);
  const loaded = stored.identity === identity;
  const note = loaded ? stored.note : '';
  const state = authorizedState(loaded, stored.state, !!identity);
  const isSaving = !!physicalIdentity && activeSaves.has(physicalIdentity);
  const save = async () => {
    if (!userId || !orderId || !loaded || !physicalIdentity || busyPhysicalIdentities.current.has(physicalIdentity)) return;
    const owner = identity;
    const writeIdentity = physicalIdentity;
    const request = ++saveSequence.current;
    const draft = draftSequence.current;
    const value = note;
    busyPhysicalIdentities.current.add(writeIdentity);
    setActiveSaves(new Set(busyPhysicalIdentities.current));
    setStored({ identity: owner, note: value, state: 'saving' });
    let saved = false;
    try {
      saved = await saveNote(userId, orderId, value);
    } catch {
      saved = false;
    } finally {
      busyPhysicalIdentities.current.delete(writeIdentity);
      if (mounted.current) setActiveSaves(new Set(busyPhysicalIdentities.current));
      if (!mounted.current || identityRef.current !== owner || saveSequence.current !== request || draftSequence.current !== draft) return;
      setStored({ identity: owner, note: value.trim().slice(0, NOTE_MAX_LENGTH), state: saved ? 'saved' : 'error' });
    }
  };
  const authorized = !!userId && !!orderId;
  const visibleState = isSaving ? 'saving' : state;
  return <TaskScreenShell title="Ghi chú riêng" onBack={() => backFromFlow(navigation)}
    primary={{ label: visibleState === 'saving' ? 'Đang lưu ghi chú…' : 'Lưu ghi chú trên thiết bị', testID: 'personal-order-note-save', onPress: () => { void save(); }, disabled: !authorized || !loaded || visibleState === 'loading' || isSaving }}>
    <ReadOnlyNotice>Ghi chú chỉ lưu trên thiết bị theo tài khoản và mã đơn. Nội dung không gửi lên máy chủ, không hiển thị cho khách hàng và không dùng làm ghi chú hoàn tất.</ReadOnlyNotice>
    {!authorized && <ReadOnlyNotice>Ghi chú chỉ mở cho kỹ thuật viên đang được xác minh trên đơn hiện tại.</ReadOnlyNotice>}
    {authorized && <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: 14 }}>Ghi chú cá nhân · tối đa {NOTE_MAX_LENGTH} ký tự</Text>
      <TextInput accessibilityLabel="Ghi chú riêng trên thiết bị" multiline textAlignVertical="top" maxLength={NOTE_MAX_LENGTH}
        editable={loaded} value={note} onChangeText={value => {
          draftSequence.current += 1;
          setStored({ identity, note: value, state: 'ready' });
        }}
        placeholder="Ví dụ: lưu ý riêng khi quay lại đơn…" placeholderTextColor={colors.muted}
        style={{ minHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, color: colors.text, fontSize: 16, lineHeight: 23 }} />
      <Text style={{ color: colors.textSecondary, textAlign: 'right' }}>{note.length}/{NOTE_MAX_LENGTH}</Text>
      {visibleState === 'saving' && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>Đang lưu ghi chú trên thiết bị…</Text>}
      {visibleState === 'saved' && <Text accessibilityLiveRegion="polite" style={{ color: colors.success }}>Đã lưu trên thiết bị.</Text>}
      {visibleState === 'error' && <Text accessibilityLiveRegion="polite" style={{ color: colors.error }}>Không tải hoặc lưu được ghi chú trên thiết bị.</Text>}
    </View>}
  </TaskScreenShell>;
}

function authorizedState(loaded: boolean, state: 'ready' | 'saved' | 'saving' | 'error', authorized: boolean): 'loading' | 'ready' | 'saved' | 'saving' | 'error' {
  if (!authorized) return 'error';
  return loaded ? state : 'loading';
}
