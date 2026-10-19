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
