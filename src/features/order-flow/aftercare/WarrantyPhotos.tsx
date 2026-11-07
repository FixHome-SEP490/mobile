import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { pickAndUploadWarrantyPhoto, WARRANTY_PHOTO_MAX } from './warranty-photos';

/**
 * Up to five photos for a warranty step. `urls` is controlled by the screen; every uploaded URL is also
 * reported to the controller (`onUploaded`) so that it can be sent as evidence.
 */
export function WarrantyPhotos({ urls, onChange, onUploaded, disabled = false, pick = pickAndUploadWarrantyPhoto }: {
  urls: string[];
  onChange: (urls: string[]) => void;
  onUploaded: (urls: string[]) => void;
  disabled?: boolean;
  pick?: typeof pickAndUploadWarrantyPhoto;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (source: 'library' | 'camera-photo') => {
    if (busy || disabled || urls.length >= WARRANTY_PHOTO_MAX) return;
    setBusy(true); setError(null);
    try {
      const url = await pick(source);
      if (url) { const next = [...urls, url]; onUploaded(next); onChange(next); }
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Không tải được ảnh. Vui lòng thử lại.');
    } finally { setBusy(false); }
  };
  const remove = (url: string) => { const next = urls.filter(item => item !== url); onUploaded(next); onChange(next); };
  const button = { minHeight: 44, flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface };
  return <View style={{ gap: spacing.sm }}>
    <Text style={{ color: colors.text, fontSize: 15 }}>Ảnh đính kèm ({urls.length}/{WARRANTY_PHOTO_MAX})</Text>
    {urls.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {urls.map((url, index) => <View key={url}>
        <Image source={{ uri: url }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh ${index + 1}`} style={{ width: 72, height: 72, borderRadius: 10 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ ảnh ${index + 1}`} disabled={disabled} onPress={() => remove(url)} style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.surface, fontSize: 14, lineHeight: 16 }}>×</Text>
        </Pressable>
      </View>)}
    </View> : null}
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chụp ảnh" disabled={busy || disabled || urls.length >= WARRANTY_PHOTO_MAX} onPress={() => void add('camera-photo')} style={button}><Text style={{ color: colors.text, fontWeight: '700' }}>{busy ? 'Đang tải…' : 'Chụp ảnh'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Chọn ảnh từ thư viện" disabled={busy || disabled || urls.length >= WARRANTY_PHOTO_MAX} onPress={() => void add('library')} style={button}><Text style={{ color: colors.text, fontWeight: '700' }}>Chọn ảnh</Text></Pressable>
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{error}</Text> : null}
  </View>;
}
