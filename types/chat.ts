export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string;
}

export interface Attachment {
  id?: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  width?: number;
  height?: number;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user?: {
    id: string;
    displayName: string;
  };
}

export interface QuotedMessage {
  id: string;
  type: string;
  content: string | null;
  isDeleted?: boolean;
  sender?: {
    id: string;
    displayName: string;
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'DELETED';
  content: string | null;
  status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  isEdited: boolean;
  editedAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedForUserIds?: string | null;
  createdAt: string;
  updatedAt: string;
  replyToId?: string | null;
  replyTo?: QuotedMessage | null;
  sender?: UserSummary | null;
  attachments?: Attachment[];
  reactions?: MessageReaction[];
  readBy?: Array<{ userId: string; readAt: string }>;
}

export interface ConversationMember {
  id: string;
  role: 'MEMBER' | 'ADMIN' | 'OWNER';
  user: UserSummary;
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string;
  avatarUrl?: string | null;
  description?: string | null;
  updatedAt: string;
  otherUser?: UserSummary | null;
  members: ConversationMember[];
  lastMessage?: {
    id: string;
    type: string;
    content: string | null;
    senderId: string | null;
    senderName?: string | null;
    status: string;
    createdAt: string;
    attachmentsCount?: number;
  } | null;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  myRole?: 'MEMBER' | 'ADMIN' | 'OWNER';
}
