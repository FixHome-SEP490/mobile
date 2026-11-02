// src/components/technician/BookingMediaViewer.tsx
//
// Photos and short videos the customer sent with a booking (PO 18/10/2026), for the
// technician judging the job. Private photos load with the bearer token; a video
// streams through a short-lived link, only after the technician taps it (nothing
// is downloaded up front), and a link that stops working is asked for again by "Thử lại".
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
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

// One in-flight/finished read per photo, shared by the big view and its thumbnail (cleared when the viewer unmounts).
const photoReads = new Map<string, Promise<string>>();
function readPhoto(bookingId: string, media: BookingMedia, force = false): Promise<string> {
  if (!media.isPrivate && media.url) return Promise.resolve(media.url);
  const hit = photoReads.get(media.id);
  if (hit && !force) return hit;
  const read = mediaApi.getBookingPhotoUri(bookingId, media.id);
  photoReads.set(media.id, read);
  read.catch(() => { if (photoReads.get(media.id) === read) photoReads.delete(media.id); });
  return read;
}

function usePhoto(bookingId: string, media: BookingMedia, enabled = true) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    readPhoto(bookingId, media, attempt > 0).then((u) => { if (live) setUri(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [bookingId, media, enabled, attempt]);
  const retry = () => { setFailed(false); setUri(null); setAttempt((n) => n + 1); };
  return { uri, failed, retry, fail: () => setFailed(true) };
}

function PhotoTile({ bookingId, media }: { bookingId: string; media: BookingMedia }) {
  const { colors } = useAppTheme();
  const { uri, failed, retry, fail } = usePhoto(bookingId, media);
  return (
    <View style={[styles.fill, { backgroundColor: colors.border }]} testID={`booking-photo-${media.id}`}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" onError={fail} accessibilityLabel="Ảnh khách gửi" />
      ) : failed ? (
        <TouchableOpacity style={styles.center} onPress={retry} accessibilityRole="button" accessibilityLabel="Tải lại ảnh khách gửi">
          <Text style={[styles.errorText, { color: colors.text }]}>Chưa tải được ảnh. Chạm để thử lại.</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      )}
    </View>
  );
}

function Thumb({ bookingId, media, selected, index, onPress }: {
  bookingId: string; media: BookingMedia; selected: boolean; index: number; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const video = isVideo(media);
  const { uri } = usePhoto(bookingId, media, !video);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Xem ${video ? 'video' : 'ảnh'} ${index + 1}`}
      accessibilityState={{ selected }}
      style={[styles.thumb, { backgroundColor: colors.border, borderColor: selected ? colors.primaryStrong : 'transparent' }]}
    >
      {video ? <Play size={20} color={colors.text} strokeWidth={1.75} /> : uri ? <Image source={{ uri }} style={styles.fill} resizeMode="cover" /> : null}
    </TouchableOpacity>
  );
}

/** One large item you can swipe through, with a thumbnail strip below; any number of items takes the same height. */
export default function BookingMediaViewer({ bookingId, media }: { bookingId: string; media: BookingMedia[] }) {
  const { colors } = useAppTheme();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const pager = useRef<FlatList<BookingMedia>>(null);
  const thumbs = useRef<ScrollViewInstance>(null);
  useEffect(() => () => { media.forEach((m) => photoReads.delete(m.id)); }, [media]);
  if (!media.length) return null;

  const go = (i: number) => {
    setIndex(i);
    pager.current?.scrollToOffset({ offset: i * width, animated: true });
    thumbs.current?.scrollTo({ x: Math.max(0, i * (THUMB + 8) - 2 * (THUMB + 8)), animated: true });
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.min(media.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (i !== index) { setIndex(i); thumbs.current?.scrollTo({ x: Math.max(0, i * (THUMB + 8) - 2 * (THUMB + 8)), animated: true }); }
  };

  return (
    <View style={styles.list} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.stage, { backgroundColor: colors.border }]}>
        {width > 0 ? (
          <FlatList
            ref={pager}
            data={media}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(m) => m.id}
            onScroll={onEnd}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onEnd}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            initialNumToRender={1}
            windowSize={3}
            renderItem={({ item, index: i }) => (
              <View style={{ width, aspectRatio: 4 / 3 }}>
                {Math.abs(i - index) <= 1 ? (isVideo(item)
                  ? <VideoTile bookingId={bookingId} media={item} />
                  : <PhotoTile bookingId={bookingId} media={item} />) : null}
              </View>
            )}
          />
        ) : null}
        {media.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{`${index + 1}/${media.length}`}</Text>
          </View>
        ) : null}
      </View>
      {media.length > 1 ? (
        <ScrollView ref={thumbs} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
          {media.map((m, i) => (
            <Thumb key={m.id} bookingId={bookingId} media={m} index={i} selected={i === index} onPress={() => go(i)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const THUMB = 56;
const styles = StyleSheet.create({
  list: { gap: 8 },
  stage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' },
  tile: { width: '100%', height: '100%' },
  fill: { width: '100%', height: '100%' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  errorText: { fontSize: 13, textAlign: 'center' },
  counter: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#fff' },
  thumbRow: { gap: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
