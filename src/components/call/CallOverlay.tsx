// src/components/call/CallOverlay.tsx
//
// The call screen (PO 18/10/2026), mounted once at the root so a call survives
// moving between screens. Same buttons as the web: answer or decline a ringing
// call; mute, speaker and hang up during one; close or call back after it. The
// speaker button switches between the earpiece ("Loa nhỏ") and the loudspeaker
// ("Loa to").

import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';
import { callStatusLabel, useCallStore } from '../../store/call.store';
import { useAuthStore } from '../../store/auth.store';
import { chatSocketService } from '../../services/chat-socket.service';

const NOTICE_MS = 4000;

function RoundButton(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  background: string;
  color: string;
  disabled?: boolean;
  testID: string;
  pressed?: boolean;
  caption?: string;
}) {
  return (
    <View style={styles.buttonColumn}>
      <TouchableOpacity
        testID={props.testID}
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityState={{ disabled: !!props.disabled, selected: props.pressed }}
        disabled={props.disabled}
        onPress={props.onPress}
        style={[styles.roundButton, { backgroundColor: props.background, opacity: props.disabled ? 0.4 : 1 }]}
        activeOpacity={0.8}
      >
        <Ionicons name={props.icon} size={26} color={props.color} />
      </TouchableOpacity>
      {!!props.caption && <Text style={styles.caption}>{props.caption}</Text>}
    </View>
  );
}

export default function CallOverlay() {
  const { colors } = useAppTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const state = useCallStore();
  const { status, peer, isMuted, isLoudspeaker, endInfo, notice } = state;

  // Calls ring on the personal socket room: listen for the whole signed-in session.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const stop = useCallStore.getState().initCallSignalling();
    // A call can only ring while the socket is up, whatever screen is open.
    void chatSocketService.connect();
    return () => {
      stop();
      useCallStore.getState().reset();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => useCallStore.getState().clearNotice(), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const visible = status !== 'idle';
  const inCall = status === 'connecting' || status === 'connected';

  return (
    <>
      {!!notice && !visible && (
        <View style={styles.noticeWrap} pointerEvents="none" testID="call-notice">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
      <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => {
        if (status === 'ended') state.dismissEnded();
        else if (status === 'incoming') void state.declineCall();
        else void state.hangUp();
      }}>
        <View style={[styles.screen, { backgroundColor: colors.text }]} testID="call-overlay">
          <View style={styles.top}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryTint }]}>
              <Text style={[styles.avatarText, { color: colors.primaryDark }]}>{(peer?.name || 'N').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1} testID="call-peer-name">{peer?.name || 'Người dùng'}</Text>
            {!!peer?.role && <Text style={styles.role}>{peer.role}</Text>}
            <Text style={styles.status} testID="call-status">{callStatusLabel(state)}</Text>
            {status === 'ended' && !!endInfo?.detail && <Text style={styles.detail}>{endInfo.detail}</Text>}
            {isMuted && inCall && <Text style={styles.detail}>Micro đang tắt</Text>}
          </View>

          {status === 'incoming' && (
            <View style={styles.row}>
              <RoundButton testID="call-decline" icon="call" label="Từ chối cuộc gọi" caption="Từ chối" background={colors.error} color="#FFFFFF" onPress={() => void state.declineCall()} />
              <RoundButton testID="call-accept" icon="call" label="Nghe máy" caption="Nghe" background={colors.success} color="#FFFFFF" onPress={() => void state.acceptCall()} />
            </View>
          )}

          {status === 'ended' && (
            <View style={styles.row}>
              <RoundButton testID="call-close" icon="close" label="Đóng" caption="Đóng" background="#334155" color="#FFFFFF" onPress={state.dismissEnded} />
              {endInfo?.canRedial && (
                <RoundButton testID="call-redial" icon="call" label="Gọi lại" caption="Gọi lại" background={colors.success} color="#FFFFFF" onPress={() => void state.redial()} />
              )}
            </View>
          )}

          {status !== 'incoming' && status !== 'ended' && (
            <View style={styles.row}>
              <RoundButton
                testID="call-mute"
                icon={isMuted ? 'mic-off' : 'mic'}
                label={isMuted ? 'Bật micro' : 'Tắt micro'}
                caption={isMuted ? 'Đang tắt' : 'Micro'}
                background={isMuted ? '#FFFFFF' : '#334155'}
                color={isMuted ? colors.text : '#FFFFFF'}
                pressed={isMuted}
                disabled={!inCall}
                onPress={state.toggleMute}
              />
              <RoundButton
                testID="call-speaker"
                icon={isLoudspeaker ? 'volume-high' : 'volume-low'}
                label={isLoudspeaker ? 'Đang bật loa to, chạm để chuyển loa nhỏ' : 'Đang bật loa nhỏ, chạm để chuyển loa to'}
                caption={isLoudspeaker ? 'Loa to' : 'Loa nhỏ'}
                background={isLoudspeaker ? colors.primaryStrong : '#334155'}
                color="#FFFFFF"
                pressed={isLoudspeaker}
                onPress={state.toggleLoudspeaker}
              />
              <RoundButton testID="call-hangup" icon="call" label="Kết thúc cuộc gọi" caption="Kết thúc" background={colors.error} color="#FFFFFF" onPress={() => void state.hangUp()} />
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between', paddingTop: 96, paddingBottom: 72, paddingHorizontal: 24 },
  top: { alignItems: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  avatarText: { fontSize: 40, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', maxWidth: '90%' },
  role: { color: '#CBD5E1', fontSize: 14, marginTop: 4 },
  status: { color: '#E2E8F0', fontSize: 16, marginTop: 12 },
  detail: { color: '#CBD5E1', fontSize: 14, marginTop: 8, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  buttonColumn: { alignItems: 'center', width: 88 },
  roundButton: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  caption: { color: '#E2E8F0', fontSize: 13, marginTop: 8 },
  noticeWrap: { position: 'absolute', left: 16, right: 16, bottom: 96, backgroundColor: '#0F172A', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, zIndex: 50 },
  noticeText: { color: '#FFFFFF', fontSize: 14 },
});
