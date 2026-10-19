// src/services/webrtc-call.service.ts
//
// The audio half of a voice call on the phone (PO 18/10/2026): the microphone,
// the peer connection and the handshake messages, the same steps as the web's
// service of the same name. Nothing here knows about the server; signalling is
// handed in and out. Every path out of a call runs through stop(), which gives
// the microphone back to the system.

import { PermissionsAndroid, Platform } from 'react-native';
import { loadWebRtc } from './call-native';
import type { IceCandidateInit, IceServer, SessionDescription } from './chat-socket.service';

export type CallMediaErrorKind = 'unsupported' | 'permission-denied' | 'no-microphone' | 'unknown';

export class CallMediaError extends Error {
  constructor(readonly kind: CallMediaErrorKind, message: string) {
    super(message);
    this.name = 'CallMediaError';
  }
}

export interface CallMediaHandlers {
  onIceCandidate?: (candidate: IceCandidateInit) => void;
  onConnectionStateChange?: (state: string) => void;
  /** Remote audio arrived; on the phone it plays by itself through the call audio route. */
  onRemoteAudio?: () => void;
}

type AnyPeer = {
  addTrack: (track: unknown, stream: unknown) => unknown;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
  createOffer: (options?: unknown) => Promise<SessionDescription>;
  createAnswer: () => Promise<SessionDescription>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
  connectionState?: string;
};
type AnyTrack = { stop: () => void; enabled: boolean; kind?: string };
type AnyStream = { getTracks: () => AnyTrack[]; getAudioTracks: () => { enabled: boolean }[] };

const MESSAGES: Record<CallMediaErrorKind, string> = {
  unsupported: 'Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).',
  'permission-denied': 'Bạn chưa cho FixHome dùng micro. Hãy bật quyền micro trong Cài đặt rồi gọi lại.',
  'no-microphone': 'Không tìm thấy micro trên máy này.',
  unknown: 'Không mở được micro. Vui lòng thử lại.',
};

export class WebRtcCallService {
  private pc: AnyPeer | null = null;
  private localStream: AnyStream | null = null;
  private handlers: CallMediaHandlers = {};
  private pendingCandidates: IceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  get hasActiveConnection(): boolean {
    return this.pc !== null;
  }

  /** Asked first, so a refusal shows before the other phone rings. */
  async acquireMicrophone(): Promise<void> {
    if (this.localStream) return;
    const rtc = loadWebRtc();
    if (!rtc) throw new CallMediaError('unsupported', MESSAGES.unsupported);
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new CallMediaError('permission-denied', MESSAGES['permission-denied']);
      }
    }
    try {
      // Voice only: asking for the camera would light its indicator for nothing.
      this.localStream = (await rtc.mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as AnyStream;
    } catch (error) {
      const name = (error as { name?: string })?.name;
      const kind: CallMediaErrorKind =
        name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-denied'
          : name === 'NotFoundError' ? 'no-microphone' : 'unknown';
      throw new CallMediaError(kind, MESSAGES[kind]);
    }
  }

  open(iceServers: IceServer[], handlers: CallMediaHandlers): void {
    const rtc = loadWebRtc();
    if (!rtc) throw new CallMediaError('unsupported', MESSAGES.unsupported);
    if (!this.localStream) throw new CallMediaError('unknown', 'Chưa mở được micro nên không thể bắt đầu cuộc gọi.');
    this.close();
    this.handlers = handlers;
    const pc = new rtc.RTCPeerConnection({ iceServers } as never) as unknown as AnyPeer;
    this.pc = pc;
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    pc.addEventListener('icecandidate', (event: { candidate?: { toJSON?: () => IceCandidateInit } & IceCandidateInit | null }) => {
      const candidate = event?.candidate;
      if (!candidate) return;
      this.handlers.onIceCandidate?.(typeof candidate.toJSON === 'function' ? candidate.toJSON() : {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      });
    });
    pc.addEventListener('track', () => this.handlers.onRemoteAudio?.());
    pc.addEventListener('connectionstatechange', () => {
      this.handlers.onConnectionStateChange?.(String(pc.connectionState ?? ''));
    });
  }

  async createOffer(): Promise<SessionDescription> {
    const pc = this.require();
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }

  async acceptOffer(offer: SessionDescription): Promise<SessionDescription> {
    const pc = this.require();
    const rtc = loadWebRtc()!;
    await pc.setRemoteDescription(new rtc.RTCSessionDescription(offer as never));
    await this.drainPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }

  async acceptAnswer(answer: SessionDescription): Promise<void> {
    const pc = this.require();
    const rtc = loadWebRtc()!;
    await pc.setRemoteDescription(new rtc.RTCSessionDescription(answer as never));
    await this.drainPendingCandidates();
  }

  async addIceCandidate(candidate: IceCandidateInit): Promise<void> {
    if (!this.pc) return;
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      const rtc = loadWebRtc()!;
      await this.pc.addIceCandidate(new rtc.RTCIceCandidate(candidate as never));
    } catch {
      // One unusable candidate is not fatal; one working pair is enough.
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    this.remoteDescriptionSet = true;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) await this.addIceCandidate(candidate);
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }

  close(): void {
    if (this.pc) {
      try { this.pc.close(); } catch { /* already closed */ }
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.handlers = {};
  }

  /** Close and hand the microphone back to the system. */
  stop(): void {
    this.close();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }

  private require(): AnyPeer {
    if (!this.pc) throw new CallMediaError('unknown', 'Cuộc gọi đã kết thúc.');
    return this.pc;
  }
}

export const webRtcCallService = new WebRtcCallService();
