// src/services/call-native.ts
//
// The two native pieces a voice call needs (PO 18/10/2026): react-native-webrtc
// for the microphone and the peer connection, react-native-incall-manager for
// the phone's call audio (earpiece or loudspeaker, ringtone, ringback).
//
// Neither exists in Expo Go or under Jest, and importing react-native-webrtc
// there throws. They are loaded on first use, so the rest of the app keeps
// working everywhere and a call simply says it needs the FixHome build.

import { NativeModules, Platform } from 'react-native';
import type * as WebRtc from 'react-native-webrtc';
import type InCallManagerType from 'react-native-incall-manager';

type WebRtcModule = typeof WebRtc;
type InCallManager = typeof InCallManagerType;

let webRtc: WebRtcModule | null | undefined;
let inCall: InCallManager | null | undefined;

export function loadWebRtc(): WebRtcModule | null {
  if (webRtc !== undefined) return webRtc;
  if (Platform.OS === 'web') return (webRtc = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-webrtc') as WebRtcModule;
    webRtc = mod?.RTCPeerConnection && mod?.mediaDevices ? mod : null;
  } catch {
    webRtc = null;
  }
  return webRtc;
}

export function loadInCallManager(): InCallManager | null {
  if (inCall !== undefined) return inCall;
  if (Platform.OS === 'web') return (inCall = null);
  // The package's JS loads fine without its native half (Expo Go) and then throws on every call.
  if (!NativeModules.InCallManager) return (inCall = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-incall-manager');
    inCall = (mod?.default ?? mod) as InCallManager;
    if (typeof inCall?.start !== 'function') inCall = null;
  } catch {
    inCall = null;
  }
  return inCall;
}

/** True on a build that carries the native call modules (not Expo Go, not the web build). */
export function isVoiceCallSupported(): boolean {
  return Platform.OS !== 'web' && loadWebRtc() !== null;
}

/** Test seam: forget what was loaded. */
export function resetNativeCallModules(): void {
  webRtc = undefined;
  inCall = undefined;
}

/**
 * The phone's call audio. Calls start on the earpiece ("Loa nhỏ"), as a phone
 * call does; the speaker button switches to the loudspeaker ("Loa to") and back.
 * Every method is a no-op when the module is missing.
 */
export const callAudio = {
  /** The other phone is ringing: ringback in the earpiece. */
  startRingback(): void {
    const manager = loadInCallManager();
    manager?.start({ media: 'audio', ringback: '_DTMF_' });
  },
  /** This phone is ringing. */
  startRingtone(): void {
    loadInCallManager()?.startRingtone('_DEFAULT_', [0, 600, 400], 'playback', 45);
  },
  /** Picked up: call audio routing on, tones off. */
  startCall(loudspeaker: boolean): void {
    const manager = loadInCallManager();
    if (!manager) return;
    manager.stopRingtone();
    manager.stopRingback();
    manager.start({ media: 'audio' });
    manager.setKeepScreenOn(true);
    manager.setForceSpeakerphoneOn(loudspeaker);
  },
  setLoudspeaker(on: boolean): void {
    loadInCallManager()?.setForceSpeakerphoneOn(on);
  },
  stop(): void {
    const manager = loadInCallManager();
    if (!manager) return;
    manager.stopRingtone();
    manager.stopRingback();
    manager.setKeepScreenOn(false);
    manager.setForceSpeakerphoneOn(false);
    manager.stop();
  },
};
