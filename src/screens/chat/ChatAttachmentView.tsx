// src/screens/chat/ChatAttachmentView.tsx
//
// The photo or video inside a chat bubble (PO 18/10/2026). A photo loads with the bearer token (no public link
// exists); a video streams through a short-lived link, only after it is tapped, and "Thử lại" asks for a new link.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { messagingApi, type ChatAttachment } from '../../api/messaging.api';
import { apiUrl, type VideoLink } from '../../api/media.api';

function Player({ uri, onError }: { uri: string; onError: () => void }) {
  const player = useVideoPlayer(uri, (p) => { p.play(); });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => { if (status === 'error') onError(); });
    return () => sub.remove();
  }, [player, onError]);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.fill} />;
}

export default function ChatAttachmentView({
  messageId, attachment, localUri, textColor,
}: { messageId: string; attachment: ChatAttachment; localUri?: string; textColor: string }) {
  const isVideo = attachment.kind === 'video';
  const [photo, setPhoto] = useState<{ uri: string; headers?: Record<string, string> } | null>(localUri && !isVideo ? { uri: localUri } : null);
  const [failed, setFailed] = useState(false);
  const [link, setLink] = useState<VideoLink | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isVideo || localUri || messageId.startsWith('local-')) return;
    let live = true;
    messagingApi.getAttachmentPhotoSource(messageId).then((s) => { if (live) setPhoto(s); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [messageId, isVideo, localUri]);

  const open = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setLink(await messagingApi.getAttachmentVideoLink(messageId));
      setPlaying(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [messageId]);
  const onPlayerError = useCallback(() => { setPlaying(false); setFailed(true); }, []);

  return (
    <View style={styles.tile} testID={`chat-attachment-${messageId}`}>
      {isVideo ? (
        playing && link ? <Player uri={apiUrl(link.url)} onError={onPlayerError} /> : (
          <TouchableOpacity
            style={styles.fill}
            disabled={loading || messageId.startsWith('local-')}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={failed ? 'Thử lại phát video' : 'Phát video'}
          >
            {link ? <Image source={{ uri: apiUrl(link.posterUrl) }} style={styles.fill} /> : null}
            <View style={styles.center}>
              {loading ? <ActivityIndicator color={textColor} /> : failed ? (
                <Text style={[styles.note, { color: textColor }]}>Chưa phát được video. Chạm để thử lại.</Text>
              ) : <Ionicons name="play-circle-outline" size={44} color={textColor} />}
            </View>
          </TouchableOpacity>
        )
      ) : photo && !failed ? (
        <Image source={photo} style={styles.fill} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel="Ảnh trong cuộc trò chuyện" />
      ) : (
        <View style={styles.center}>
          {failed ? <Text style={[styles.note, { color: textColor }]}>Chưa tải được ảnh.</Text> : <ActivityIndicator color={textColor} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 220, height: 165, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 6 },
  fill: { width: '100%', height: '100%' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 8 },
  note: { fontSize: 12, textAlign: 'center' },
});
