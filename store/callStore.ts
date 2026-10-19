import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import { getSocket } from '../lib/socket';
import { callService } from '../services/call.service';
import { CallParticipant, CallType, IncomingCallPayload } from '../types/call';

export type CallStage =
  | 'IDLE'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'ENDED';

interface CallState {
  stage: CallStage;
  callId: string | null;
  conversationId: string | null;
  callType: CallType | null;
  otherUser: CallParticipant | null;
  isIncoming: boolean;
  token: string | null;
  serverUrl: string | null;
  roomName: string | null;
  duration: number; // in seconds
  isMuted: boolean;
  isCameraEnabled: boolean;
  isSpeakerOn: boolean;
  endReason: string | null;

  // Actions
  initiateCall: (conversationId: string, callType: CallType, recipient: CallParticipant) => Promise<string | null>;
  setIncomingCall: (payload: IncomingCallPayload) => void;
  acceptCall: () => Promise<boolean>;
  declineCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  setDuration: (duration: number) => void;
  resetCall: () => void;
  bindSocketEvents: () => void;
}

let vibrationInterval: ReturnType<typeof setInterval> | null = null;

function startVibration() {
  stopVibration();
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    vibrationInterval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, 2000);
  } catch {}
}

function stopVibration() {
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
}

export const useCallStore = create<CallState>((set, get) => ({
  stage: 'IDLE',
  callId: null,
  conversationId: null,
  callType: null,
  otherUser: null,
  isIncoming: false,
  token: null,
  serverUrl: null,
  roomName: null,
  duration: 0,
  isMuted: false,
  isCameraEnabled: true,
  isSpeakerOn: false,
  endReason: null,

  initiateCall: async (conversationId, callType, recipient) => {
    try {
      set({
        stage: 'OUTGOING_RINGING',
        callId: null,
        conversationId,
        callType,
        otherUser: recipient,
        isIncoming: false,
        duration: 0,
        isMuted: false,
        isCameraEnabled: callType === 'VIDEO',
        isSpeakerOn: callType === 'VIDEO',
        endReason: null,
      });

      const res = await callService.initiateCall({ conversationId, callType });
      set({ callId: res.callId });

      // Fetch LiveKit token for caller right away
      try {
        const tokenRes = await callService.getCallToken(res.callId);
        set({
          token: tokenRes.token,
          serverUrl: tokenRes.serverUrl,
          roomName: tokenRes.roomName,
        });
      } catch (tokenErr) {
        console.warn('Caller token fetch delayed:', tokenErr);
      }

      return res.callId;
    } catch (err: any) {
      console.error('Failed to initiate call:', err);
      const msg = err.response?.data?.error || err.message || 'Call failed';
      set({ stage: 'ENDED', endReason: msg });
      setTimeout(() => {
        if (get().stage === 'ENDED') get().resetCall();
      }, 3000);
      return null;
    }
  },

  setIncomingCall: (payload) => {
    const current = get();
    // If already in a call, notify socket caller is busy
    if (current.stage !== 'IDLE') {
      const socket = getSocket();
      socket?.emit('call:busy', { callId: payload.callId });
      return;
    }

    startVibration();

    set({
      stage: 'INCOMING_RINGING',
      callId: payload.callId,
      conversationId: payload.conversationId,
      callType: payload.callType,
      otherUser: payload.caller,
      isIncoming: true,
      duration: 0,
      isMuted: false,
      isCameraEnabled: payload.callType === 'VIDEO',
      isSpeakerOn: payload.callType === 'VIDEO',
      endReason: null,
    });
  },

  acceptCall: async () => {
    stopVibration();
    const { callId } = get();
    if (!callId) return false;

    set({ stage: 'CONNECTING' });

    try {
      await callService.acceptCall(callId);
      const tokenRes = await callService.getCallToken(callId);

      set({
        stage: 'ACTIVE',
        token: tokenRes.token,
        serverUrl: tokenRes.serverUrl,
        roomName: tokenRes.roomName,
      });
      return true;
    } catch (err: any) {
      console.error('Failed to accept call:', err);
      set({ stage: 'ENDED', endReason: err.response?.data?.error || 'Failed to connect' });
      setTimeout(() => {
        if (get().stage === 'ENDED') get().resetCall();
      }, 2500);
      return false;
    }
  },

  declineCall: async () => {
    stopVibration();
    const { callId } = get();
    if (callId) {
      try {
        await callService.declineCall(callId);
      } catch (err) {
        console.warn('Decline error:', err);
      }
    }
    get().resetCall();
  },

  cancelCall: async () => {
    stopVibration();
    const { callId } = get();
    if (callId) {
      try {
        await callService.cancelCall(callId);
      } catch (err) {
        console.warn('Cancel error:', err);
      }
    }
    get().resetCall();
  },

  endCall: async () => {
    stopVibration();
    const { callId } = get();
    if (callId) {
      try {
        await callService.endCall(callId);
      } catch (err) {
        console.warn('End call error:', err);
      }
    }
    set({ stage: 'ENDED', endReason: 'Call ended' });
    setTimeout(() => {
      get().resetCall();
    }, 1500);
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleCamera: () => set((state) => ({ isCameraEnabled: !state.isCameraEnabled })),
  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),
  setDuration: (duration) => set({ duration }),

  resetCall: () => {
    stopVibration();
    set({
      stage: 'IDLE',
      callId: null,
      conversationId: null,
      callType: null,
      otherUser: null,
      isIncoming: false,
      token: null,
      serverUrl: null,
      roomName: null,
      duration: 0,
      isMuted: false,
      isCameraEnabled: true,
      isSpeakerOn: false,
      endReason: null,
    });
  },

  bindSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;

    // Remove any previous call event listeners to avoid duplicates
    socket.off('call:incoming');
    socket.off('call:accepted');
    socket.off('call:declined');
    socket.off('call:cancelled');
    socket.off('call:ended');
    socket.off('call:timeout');
    socket.off('call:busy');

    // 1. Incoming call from another user
    socket.on('call:incoming', (payload: IncomingCallPayload) => {
      get().setIncomingCall(payload);
    });

    // 2. Caller receives acceptance from recipient
    socket.on('call:accepted', async (data: { callId: string; callType: CallType }) => {
      const state = get();
      if (state.callId === data.callId) {
        // Recipient accepted! If caller doesn't have token yet, fetch it
        if (!state.token) {
          try {
            const tokenRes = await callService.getCallToken(data.callId);
            set({
              token: tokenRes.token,
              serverUrl: tokenRes.serverUrl,
              roomName: tokenRes.roomName,
            });
          } catch (err) {
            console.error('Error fetching caller token on accept:', err);
          }
        }
        set({ stage: 'ACTIVE' });
      }
    });

    // 3. Caller receives decline
    socket.on('call:declined', (data: { callId: string }) => {
      const state = get();
      if (state.callId === data.callId) {
        stopVibration();
        set({ stage: 'ENDED', endReason: 'Call declined' });
        setTimeout(() => {
          if (get().stage === 'ENDED') get().resetCall();
        }, 2000);
      }
    });

    // 4. Recipient receives cancellation from caller
    socket.on('call:cancelled', (data: { callId: string }) => {
      const state = get();
      if (state.callId === data.callId) {
        stopVibration();
        set({ stage: 'ENDED', endReason: 'Caller cancelled' });
        setTimeout(() => {
          if (get().stage === 'ENDED') get().resetCall();
        }, 1500);
      }
    });

    // 5. Either participant ends
    socket.on('call:ended', (data: { callId: string; endedBy?: string }) => {
      const state = get();
      if (state.callId === data.callId) {
        stopVibration();
        set({ stage: 'ENDED', endReason: 'Call ended' });
        setTimeout(() => {
          if (get().stage === 'ENDED') get().resetCall();
        }, 1500);
      }
    });

    // 6. 45-second ring timeout
    socket.on('call:timeout', (data: { callId: string }) => {
      const state = get();
      if (state.callId === data.callId) {
        stopVibration();
        set({ stage: 'ENDED', endReason: 'No answer' });
        setTimeout(() => {
          if (get().stage === 'ENDED') get().resetCall();
        }, 2500);
      }
    });

    // 7. Recipient is busy
    socket.on('call:busy', (data: { callId: string }) => {
      const state = get();
      if (state.callId === data.callId) {
        stopVibration();
        set({ stage: 'ENDED', endReason: 'User is busy on another call' });
        setTimeout(() => {
          if (get().stage === 'ENDED') get().resetCall();
        }, 2500);
      }
    });
  },
}));
