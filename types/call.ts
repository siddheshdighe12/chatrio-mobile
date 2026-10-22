export type CallType = 'AUDIO' | 'VIDEO';

export type CallStatus =
  | 'RINGING'
  | 'ACTIVE'
  | 'ENDED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'MISSED'
  | 'FAILED';

export interface CallParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  recipientId: string;
  callType: CallType;
  status: CallStatus;
  livekitRoom: string;
  startedAt?: string | null;
  endedAt?: string | null;
  duration?: number | null;
  createdAt: string;
  caller?: CallParticipant;
  recipient?: CallParticipant;
}

export interface CallTokenResponse {
  token: string;
  serverUrl: string;
  roomName: string;
}

export interface IncomingCallPayload {
  callId: string;
  callType: CallType;
  conversationId: string;
  caller: CallParticipant;
}

// ── Group Calls ──────────────────────────────────────────────────────────────

export interface GroupCallParticipant {
  id: string;
  groupCallId: string;
  userId: string;
  joinedAt: string;
  leftAt?: string | null;
  isActive: boolean;
  user: CallParticipant;
}

export interface GroupCall {
  id: string;
  conversationId: string;
  initiatorId: string;
  callType: CallType;
  status: 'ACTIVE' | 'ENDED';
  livekitRoom: string;
  startedAt: string;
  endedAt?: string | null;
  initiator?: CallParticipant;
  participants: GroupCallParticipant[];
}

export interface GroupCallResponse {
  groupCallId: string;
  livekitRoom: string;
  token: string;
  serverUrl: string;
  callType: CallType;
  conversationId: string;
  isExisting?: boolean;
}

export interface IncomingGroupCallPayload {
  groupCallId: string;
  conversationId: string;
  callType: CallType;
  initiator: CallParticipant;
  groupName?: string;
  activeParticipants?: CallParticipant[];
}
