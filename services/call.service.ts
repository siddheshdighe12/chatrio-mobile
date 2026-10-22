import { api } from '../lib/api';
import {
  Call,
  CallTokenResponse,
  CallType,
  GroupCall,
  GroupCallResponse,
} from '../types/call';

export interface InitiateCallPayload {
  conversationId: string;
  callType: CallType;
}

export interface InitiateCallResponse {
  callId: string;
  callType: CallType;
  status: string;
  conversationId: string;
  recipient: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export const callService = {
  /**
   * Initiate a new audio or video call in a DIRECT conversation
   */
  async initiateCall(payload: InitiateCallPayload): Promise<InitiateCallResponse> {
    const res = await api.post<InitiateCallResponse>('/calls/initiate', payload);
    return res.data;
  },

  /**
   * Get LiveKit access token and serverUrl for an authorized call participant
   */
  async getCallToken(callId: string): Promise<CallTokenResponse> {
    const res = await api.post<CallTokenResponse>(`/calls/${callId}/token`);
    return res.data;
  },

  /**
   * Recipient accepts an incoming call
   */
  async acceptCall(callId: string): Promise<{ callId: string; status: string }> {
    const res = await api.post<{ callId: string; status: string }>(`/calls/${callId}/accept`);
    return res.data;
  },

  /**
   * Recipient declines an incoming call
   */
  async declineCall(callId: string): Promise<{ callId: string; status: string }> {
    const res = await api.post<{ callId: string; status: string }>(`/calls/${callId}/decline`);
    return res.data;
  },

  /**
   * Caller cancels an outgoing call
   */
  async cancelCall(callId: string): Promise<{ callId: string; status: string }> {
    const res = await api.post<{ callId: string; status: string }>(`/calls/${callId}/cancel`);
    return res.data;
  },

  /**
   * Either participant ends an active call
   */
  async endCall(callId: string): Promise<{ callId: string; status: string; duration?: number | null }> {
    const res = await api.post<{ callId: string; status: string; duration?: number | null }>(`/calls/${callId}/end`);
    return res.data;
  },

  /**
   * Fetch call history for a direct conversation
   */
  async getCallHistory(conversationId: string, limit = 20, before?: string): Promise<Call[]> {
    const res = await api.get<Call[]>(`/conversations/${conversationId}/calls`, {
      params: { limit, before },
    });
    return res.data;
  },

  // ── Group Call Methods ──────────────────────────────────────────────────────

  /**
   * Initiate or join active group call in a GROUP conversation
   */
  async initiateGroupCall(payload: InitiateCallPayload): Promise<GroupCallResponse> {
    const res = await api.post<GroupCallResponse>('/calls/group/initiate', payload);
    return res.data;
  },

  /**
   * Join an active group call
   */
  async joinGroupCall(groupCallId: string): Promise<GroupCallResponse> {
    const res = await api.post<GroupCallResponse>(`/calls/group/${groupCallId}/join`);
    return res.data;
  },

  /**
   * Participant leaves a group call
   */
  async leaveGroupCall(groupCallId: string): Promise<{ success: boolean; remaining: number }> {
    const res = await api.post<{ success: boolean; remaining: number }>(`/calls/group/${groupCallId}/leave`);
    return res.data;
  },

  /**
   * Initiator or admin ends the group call for everyone
   */
  async endGroupCall(groupCallId: string): Promise<{ success: boolean }> {
    const res = await api.post<{ success: boolean }>(`/calls/group/${groupCallId}/end`);
    return res.data;
  },

  /**
   * Fetch active group call for a conversation (if any)
   */
  async getActiveGroupCall(conversationId: string): Promise<{ activeCall: GroupCall | null }> {
    const res = await api.get<{ activeCall: GroupCall | null }>(`/calls/group/active/${conversationId}`);
    return res.data;
  },
};
