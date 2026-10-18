// src/store/call.store.ts
//
// Voice calls on the phone (PO 18/10/2026), the same life as on the web:
// idle -> outgoing -> ringing -> connecting -> connected -> ended for the caller,
// idle -> incoming -> connecting -> connected -> ended for the callee, with the
// same server events, the same end reasons and the same Vietnamese wording.
// The phone adds the speaker switch: calls start on the earpiece ("Loa nhỏ").

import { create } from 'zustand';
import { messagingApi } from '../api/messaging.api';
import { chatSocketService, type CallEndReason } from '../services/chat-socket.service';
import { callAudio } from '../services/call-native';
import { CallMediaError, webRtcCallService } from '../services/webrtc-call.service';

export type CallStatus = 'idle' | 'outgoing' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'ended';

export interface CallEndInfo {
  title: string;
  detail: string;
  canRedial: boolean;
  failed: boolean;
}

export interface CallPeer {
  name: string;
  role: string;
}

export const END_SCREEN_MS = 4000;
export const END_SCREEN_REDIAL_MS = 7000;
export const CONNECT_TIMEOUT_MS = 20_000;

const INVITE_REASON_TEXT: Record<string, string> = {
  forbidden: 'Không thể gọi trong cuộc trò chuyện này',
  invalid: 'Không thể bắt đầu cuộc gọi',
  self_busy: 'Bạn đang trong một cuộc gọi khác',
};

export const formatDuration = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

interface CallState {
  status: CallStatus;
  callId: string | null;
  conversationId: string | null;
  role: 'caller' | 'callee' | null;
  peer: CallPeer | null;
  isMuted: boolean;
  /** Loudspeaker ("Loa to") or earpiece ("Loa nhỏ"). */
  isLoudspeaker: boolean;
  durationSeconds: number;
  endInfo: CallEndInfo | null;
  /** A short line for things that are not the call screen's business (a missed call while busy). */
  notice: string | null;

  initCallSignalling: () => () => void;
  startCall: (conversationId: string, peer?: CallPeer) => Promise<void>;
  redial: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleLoudspeaker: () => void;
  dismissEnded: () => void;
  clearNotice: () => void;
  reset: () => void;
}

let unsubscribe: (() => void) | null = null;
let durationTimer: ReturnType<typeof setInterval> | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;

const roleLabel = (role: string | undefined | null) => {
  const r = String(role ?? '').toUpperCase();
  return r === 'TECHNICIAN' ? 'Kỹ thuật viên' : r === 'CUSTOMER' ? 'Khách hàng' : '';
};

export const isCallBusy = (status: CallStatus) => status !== 'idle' && status !== 'ended';

export const useCallStore = create<CallState>()((set, get) => {
  const peerName = () => get().peer?.name || 'Người dùng';

  function stopTimers() {
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = null;
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
  }

  function stopMedia() {
    stopTimers();
    callAudio.stop();
    webRtcCallService.stop();
  }

  function reset() {
    stopMedia();
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
    set({ status: 'idle', callId: null, conversationId: null, role: null, peer: null, isMuted: false, isLoudspeaker: false, durationSeconds: 0, endInfo: null });
  }

  function showEnd(info: CallEndInfo) {
    stopMedia();
    set({ callId: null, endInfo: info, status: 'ended', isMuted: false });
    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(reset, info.canRedial ? END_SCREEN_REDIAL_MS : END_SCREEN_MS);
  }

  function failCall(title: string) {
    const id = get().callId;
    showEnd({ title, detail: 'Mạng của một trong hai bên đang chặn cuộc gọi. Hãy thử lại hoặc nhắn tin.', canRedial: true, failed: true });
    if (id) void chatSocketService.callEnd(id);
  }

  function startConnectTimeout() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      if (get().status === 'connecting') failCall('Không kết nối được');
    }, CONNECT_TIMEOUT_MS);
  }

  function connected() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    set({ status: 'connected', durationSeconds: 0 });
    if (durationTimer) clearInterval(durationTimer);
    durationTimer = setInterval(() => set((s) => ({ durationSeconds: s.durationSeconds + 1 })), 1000);
  }

  function openPeerConnection() {
    webRtcCallService.open(chatSocketService.iceServers, {
      onIceCandidate(candidate) {
        const id = get().callId;
        if (id) chatSocketService.sendIceCandidate(id, candidate);
      },
      onConnectionStateChange(state) {
        if (state === 'connected') connected();
        else if (state === 'failed') failCall('Không kết nối được');
      },
    });
    callAudio.startCall(get().isLoudspeaker);
  }

  function endedByServer(reason: CallEndReason) {
    const caller = get().role === 'caller';
    const talked = get().durationSeconds;
    switch (reason) {
      case 'answered_elsewhere':
        return reset();
      case 'rejected':
        if (!caller) return reset();
        return showEnd({ title: 'Cuộc gọi bị từ chối', detail: `${peerName()} đang bận, hãy nhắn tin hoặc gọi lại sau.`, canRedial: true, failed: true });
      case 'cancelled':
        if (caller) return reset();
        return showEnd({ title: 'Cuộc gọi nhỡ', detail: `${peerName()} đã gọi cho bạn.`, canRedial: true, failed: true });
      case 'timeout':
        return caller
          ? showEnd({ title: 'Không trả lời', detail: `${peerName()} chưa nghe máy.`, canRedial: true, failed: true })
          : showEnd({ title: 'Cuộc gọi nhỡ', detail: `${peerName()} đã gọi cho bạn.`, canRedial: true, failed: true });
      case 'busy':
        return showEnd({ title: 'Máy bận', detail: `${peerName()} đang trong cuộc gọi khác.`, canRedial: true, failed: true });
      case 'disconnected':
        return showEnd({ title: 'Mất kết nối', detail: `Không còn kết nối với ${peerName()}.`, canRedial: true, failed: true });
      case 'ended':
      default:
        return showEnd({ title: 'Cuộc gọi đã kết thúc', detail: talked ? `Thời lượng ${formatDuration(talked)}` : '', canRedial: false, failed: false });
    }
  }

  /** The name and role on the call screen come from the conversation the call belongs to. */
  async function loadPeer(conversationId: string) {
    try {
      const conversation = await messagingApi.getConversation(conversationId);
      if (get().conversationId !== conversationId) return;
      set({ peer: { name: conversation.counterpart?.fullName || 'Người dùng', role: roleLabel(conversation.counterpart?.role) } });
    } catch {
      // The call works without a name; "Người dùng" shows instead.
    }
  }

  return {
    status: 'idle',
    callId: null,
    conversationId: null,
    role: null,
    peer: null,
    isMuted: false,
    isLoudspeaker: false,
    durationSeconds: 0,
    endInfo: null,
    notice: null,

    initCallSignalling() {
      if (unsubscribe) return unsubscribe;
      const stop = chatSocketService.subscribe({
        onCallIncoming(event) {
          // One live call per person on the server: anything while busy is stale.
          if (isCallBusy(get().status)) return;
          if (endTimer) clearTimeout(endTimer);
          set({ status: 'incoming', callId: event.callId, conversationId: event.conversationId, role: 'callee', peer: null, endInfo: null, isLoudspeaker: false, isMuted: false });
          callAudio.startRingtone();
          chatSocketService.callRinging(event.callId);
          void loadPeer(event.conversationId);
        },
        onCallRinging(event) {
          if (event.callId !== get().callId || get().status !== 'outgoing') return;
          set({ status: 'ringing' });
          callAudio.startRingback();
        },
        async onCallAccepted(event) {
          if (event.callId !== get().callId) return;
          set({ status: 'connecting' });
          startConnectTimeout();
          try {
            openPeerConnection();
            chatSocketService.sendOffer(event.callId, await webRtcCallService.createOffer());
          } catch {
            failCall('Không thiết lập được cuộc gọi');
          }
        },
        async onCallOffer(event) {
          if (event.callId !== get().callId) return;
          try {
            chatSocketService.sendAnswer(event.callId, await webRtcCallService.acceptOffer(event.data));
          } catch {
            failCall('Không thiết lập được cuộc gọi');
          }
        },
        async onCallAnswer(event) {
          if (event.callId !== get().callId) return;
          try {
            await webRtcCallService.acceptAnswer(event.data);
          } catch {
            failCall('Không thiết lập được cuộc gọi');
          }
        },
        async onCallIce(event) {
          if (event.callId !== get().callId) return;
          await webRtcCallService.addIceCandidate(event.data);
        },
        onCallEnded(event) {
          if (event.callId !== get().callId) return;
          endedByServer(event.reason);
        },
        onCallMissed() {
          set({ notice: 'Có người vừa gọi cho bạn lúc bạn đang trong cuộc gọi khác.' });
        },
        onStatusChange(isConnected) {
          if (!isConnected && isCallBusy(get().status)) {
            showEnd({ title: 'Mất kết nối máy chủ', detail: 'Cuộc gọi đã dừng. Kiểm tra mạng rồi gọi lại.', canRedial: true, failed: true });
          }
        },
      });
      unsubscribe = () => {
        stop();
        unsubscribe = null;
      };
      return unsubscribe;
    },

    async startCall(conversationId, peer) {
      if (isCallBusy(get().status)) return;
      if (endTimer) clearTimeout(endTimer);
      set({ endInfo: null, status: 'idle' });
      // The microphone first: if it fails, it fails before the other phone rings.
      try {
        await webRtcCallService.acquireMicrophone();
      } catch (error) {
        set({ notice: error instanceof CallMediaError ? error.message : 'Không mở được micro' });
        return;
      }
      set({ conversationId, role: 'caller', status: 'outgoing', peer: peer ?? get().peer, isLoudspeaker: false, isMuted: false });
      if (!peer) void loadPeer(conversationId);
      const result = await chatSocketService.callInvite(conversationId);
      if (!result.ok || !result.callId) {
        if (result.reason === 'offline') {
          return showEnd({ title: 'Không liên lạc được', detail: `${peerName()} hiện không mở ứng dụng. Họ sẽ thấy cuộc gọi nhỡ của bạn.`, canRedial: true, failed: true });
        }
        if (result.reason === 'busy') {
          return showEnd({ title: 'Máy bận', detail: `${peerName()} đang trong cuộc gọi khác.`, canRedial: true, failed: true });
        }
        set({ notice: INVITE_REASON_TEXT[result.reason ?? 'invalid'] ?? 'Không thể bắt đầu cuộc gọi' });
        reset();
        return;
      }
      set({ callId: result.callId });
    },

    async redial() {
      const { status, conversationId, peer } = get();
      if (status !== 'ended' || !conversationId) return;
      await get().startCall(conversationId, peer ?? undefined);
    },

    async acceptCall() {
      const id = get().callId;
      if (get().status !== 'incoming' || !id) return;
      try {
        await webRtcCallService.acquireMicrophone();
        openPeerConnection();
      } catch (error) {
        set({ notice: error instanceof CallMediaError ? error.message : 'Không mở được micro' });
        await get().declineCall();
        return;
      }
      set({ status: 'connecting' });
      startConnectTimeout();
      const result = await chatSocketService.callAccept(id);
      if (!result.ok) {
        showEnd({ title: 'Cuộc gọi không còn hiệu lực', detail: 'Người gọi đã dừng trước khi bạn nghe máy.', canRedial: true, failed: true });
      }
    },

    async declineCall() {
      const id = get().callId;
      reset();
      if (id) await chatSocketService.callReject(id);
    },

    async hangUp() {
      const { callId: id, status, durationSeconds } = get();
      const wasRinging = status === 'outgoing' || status === 'ringing';
      if (wasRinging) reset();
      else showEnd({ title: 'Cuộc gọi đã kết thúc', detail: durationSeconds ? `Thời lượng ${formatDuration(durationSeconds)}` : '', canRedial: false, failed: false });
      if (!id) return;
      await (wasRinging ? chatSocketService.callCancel(id) : chatSocketService.callEnd(id));
    },

    toggleMute() {
      const muted = !get().isMuted;
      set({ isMuted: muted });
      webRtcCallService.setMuted(muted);
    },

    toggleLoudspeaker() {
      const on = !get().isLoudspeaker;
      set({ isLoudspeaker: on });
      callAudio.setLoudspeaker(on);
    },

    dismissEnded() {
      if (get().status === 'ended') reset();
    },

    clearNotice() {
      set({ notice: null });
    },

    reset,
  };
});

/** The line under the name on the call screen. */
export function callStatusLabel(state: Pick<CallState, 'status' | 'durationSeconds' | 'endInfo'>): string {
  switch (state.status) {
    case 'outgoing': return 'Đang gọi…';
    case 'ringing': return 'Đang đổ chuông…';
    case 'incoming': return 'Cuộc gọi thoại đến';
    case 'connecting': return 'Đang kết nối…';
    case 'connected': return formatDuration(state.durationSeconds);
    case 'ended': return state.endInfo?.title ?? '';
    default: return '';
  }
}
