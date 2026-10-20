// src/components/technician/BookingMediaViewer.tsx
//
// Photos and short videos the customer sent with a booking (PO 18/10/2026), for the
// technician judging the job. Private photos load with the bearer token; a video
// streams through a short-lived link, only after the technician taps it (nothing
// is downloaded up front), and a link that stops working is asked for again by "Thử lại".
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play } from 'lucide-react-native';
import type { BookingMedia } from '../../api/bookings.api';
import { apiUrl, mediaApi, type VideoLink } from '../../api/media.api';
import { useAppTheme } from '../../constants/theme';

const isVideo = (m: BookingMedia) => /^video\//i.test(m.mimeType);

function Player({ uri, onError }: { uri: string; onError: () => void }) {
  const player = useVideoPlayer(uri, (p) => { p.play(); });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => { if (status === 'error') onError(); });
    return () => sub.remove();
  }, [player, onError]);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.fill} />;
}

function VideoTile({ bookingId, media }: { bookingId: string; media: BookingMedia }) {
  const { colors } = useAppTheme();
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [link, setLink] = useState<VideoLink | null>(null);

  const open = useCallback(async () => {
    setState('loading');
    try {
      setLink(await mediaApi.getBookingVideoLink(bookingId, media.id));
      setState('playing');
    } catch {
      setState('error');
    }
  }, [bookingId, media.id]);
  const onError = useCallback(() => setState('error'), []);

  return (
    <View style={[styles.tile, { backgroundColor: colors.border }]} testID={`booking-video-${media.id}`}>
      {state === 'playing' && link ? (
        <Player uri={apiUrl(link.url)} onError={onError} />
      ) : (
        <TouchableOpacity
          style={styles.fill}
          onPress={open}
          disabled={state === 'loading'}
          accessibilityRole="button"
          accessibilityLabel={state === 'error' ? 'Thử lại phát video' : 'Phát video của khách'}
        >
          {link ? <Image source={{ uri: apiUrl(link.posterUrl) }} style={styles.fill} /> : null}
          <View style={styles.center}>
            {state === 'loading' ? <ActivityIndicator color={colors.primary} /> : state === 'error' ? (
              <Text style={[styles.errorText, { color: colors.text }]}>Chưa phát được video. Chạm để thử lại.</Text>
            ) : <Play size={36} color={colors.text} strokeWidth={1.75} />}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PhotoTile({ bookingId, media }: { bookingId: string; media: BookingMedia }) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(!media.isPrivate && media.url ? media.url : null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!media.isPrivate) return;
    let live = true;
    mediaApi.getBookingPhotoUri(bookingId, media.id).then((u) => { if (live) setUri(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [bookingId, media.id, media.isPrivate, attempt]);
  return (
    <View style={[styles.tile, { backgroundColor: colors.border }]} testID={`booking-photo-${media.id}`}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel="Ảnh khách gửi" />
      ) : failed ? (
        <TouchableOpacity
          style={styles.center}
          onPress={() => { setFailed(false); setUri(null); setAttempt((n) => n + 1); }}
          accessibilityRole="button"
          accessibilityLabel="Tải lại ảnh khách gửi"
        >
          <Text style={[styles.errorText, { color: colors.text }]}>Chưa tải được ảnh. Chạm để thử lại.</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      )}
    </View>
  );
}

export default function BookingMediaViewer({ bookingId, media }: { bookingId: string; media: BookingMedia[] }) {
  if (!media.length) return null;
  return (
    <View style={styles.list}>
      {media.map((m) => (isVideo(m)
        ? <VideoTile key={m.id} bookingId={bookingId} media={m} />
        : <PhotoTile key={m.id} bookingId={bookingId} media={m} />))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  tile: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  errorText: { fontSize: 13, textAlign: 'center' },
});
