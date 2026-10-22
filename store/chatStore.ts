import { create } from 'zustand';
import { Conversation, Message, MessageReaction } from '../types/chat';
import { getSocket } from '../lib/socket';

interface ChatState {
  conversations: Conversation[];
  /** true while the initial /conversations fetch is in-flight */
  conversationsLoading: boolean;
  /** non-null when the last /conversations fetch failed */
  conversationsError: string | null;
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, Record<string, string>>; // conversationId -> { [userId]: displayName }
  presence: Record<string, { isOnline: boolean; lastSeenAt?: string }>;
  replyingTo: Message | null;
  editingMessage: Message | null;

  // Actions
  setActiveConversationId: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setConversationsLoading: (loading: boolean) => void;
  setConversationsError: (error: string | null) => void;
  addOrUpdateConversation: (conversation: Conversation) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, conversationId: string) => void;
  setReactions: (messageId: string, conversationId: string, reactions: MessageReaction[]) => void;
  setTyping: (conversationId: string, userId: string, displayName: string, isTyping: boolean) => void;
  setPresence: (userId: string, isOnline: boolean, lastSeenAt?: string) => void;
  updateUserAvatarInConversations: (userId: string, avatarUrl: string, displayName?: string) => void;
  setReplyingTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  removeConversation: (conversationId: string) => void;
  markConversationReadLocally: (conversationId: string) => void;
  bindSocketEvents: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  conversationsLoading: false,
  conversationsError: null,
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  presence: {},
  replyingTo: null,
  editingMessage: null,

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  setConversationsLoading: (loading) => set({ conversationsLoading: loading }),

  setConversationsError: (error) => set({ conversationsError: error }),

  setConversations: (conversations) =>
    set((state) => {
      const nextPresence = { ...state.presence };
      for (const c of conversations) {
        if (c.otherUser?.id && !nextPresence[c.otherUser.id]) {
          nextPresence[c.otherUser.id] = {
            isOnline: c.otherUser.isOnline ?? false,
            lastSeenAt: c.otherUser.lastSeenAt,
          };
        }
      }
      return { conversations, presence: nextPresence };
    }),

  addOrUpdateConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      const nextPresence = { ...state.presence };
      if (conversation.otherUser?.id && !nextPresence[conversation.otherUser.id]) {
        nextPresence[conversation.otherUser.id] = {
          isOnline: conversation.otherUser.isOnline ?? false,
          lastSeenAt: conversation.otherUser.lastSeenAt,
        };
      }
      if (exists) {
        return {
          presence: nextPresence,
          conversations: state.conversations.map((c) =>
            c.id === conversation.id ? { ...c, ...conversation } : c
          ),
        };
      }
      return { conversations: [conversation, ...state.conversations], presence: nextPresence };
    }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((state) => {
      const existingList = state.messages[conversationId] || [];
      // Prevent duplicates
      if (existingList.some((m) => m.id === message.id)) {
        return {
          messages: {
            ...state.messages,
            [conversationId]: existingList.map((m) => (m.id === message.id ? message : m)),
          },
        };
      }

      // Also update conversation's lastMessage and order to top
      const updatedConversations = state.conversations.map((c) => {
        if (c.id === conversationId) {
          const isCurrentlyActive = state.activeConversationId === conversationId;
          return {
            ...c,
            updatedAt: message.createdAt,
            lastMessage: {
              id: message.id,
              type: message.type,
              content: message.content,
              senderId: message.senderId,
              senderName: message.sender?.displayName || null,
              status: message.status,
              createdAt: message.createdAt,
              attachmentsCount: message.attachments?.length || 0,
            },
            unreadCount: isCurrentlyActive ? 0 : c.unreadCount + 1,
          };
        }
        return c;
      });

      // Sort conversations so the latest is at top
      updatedConversations.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existingList, message],
        },
        conversations: updatedConversations,
      };
    }),

  updateMessage: (message) =>
    set((state) => {
      const convId = message.conversationId;
      const currentList = state.messages[convId] || [];
      return {
        messages: {
          ...state.messages,
          [convId]: currentList.map((m) => (m.id === message.id ? message : m)),
        },
      };
    }),

  removeMessage: (messageId, conversationId) =>
    set((state) => {
      const currentList = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: currentList.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isDeleted: true,
                  type: 'DELETED',
                  content: 'This message was deleted',
                }
              : m
          ),
        },
      };
    }),

  setReactions: (messageId, conversationId, reactions) =>
    set((state) => {
      const currentList = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: currentList.map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        },
      };
    }),

  setTyping: (conversationId, userId, displayName, isTyping) =>
    set((state) => {
      const convTyping = { ...(state.typingUsers[conversationId] || {}) };
      if (isTyping) {
        convTyping[userId] = displayName;
      } else {
        delete convTyping[userId];
      }
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: convTyping,
        },
      };
    }),

  setPresence: (userId, isOnline, lastSeenAt) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [userId]: { isOnline, lastSeenAt },
      },
    })),

  updateUserAvatarInConversations: (userId, avatarUrl, displayName) =>
    set((state) => ({
      conversations: state.conversations.map((conv) => {
        // Update the cached other-user data for direct chats immediately.
        let updated = { ...conv };
        if (conv.otherUser?.id === userId) {
          updated = {
            ...updated,
            avatarUrl,
            name: displayName || updated.name,
            otherUser: {
              ...conv.otherUser,
              avatarUrl,
              displayName: displayName || conv.otherUser.displayName,
            },
          };
        }

        // Keep group member data in sync too.
        updated = {
          ...updated,
          members: conv.members.map((m) =>
            m.user.id === userId
              ? {
                  ...m,
                  user: {
                    ...m.user,
                    avatarUrl,
                    displayName: displayName || m.user.displayName,
                  },
                }
              : m
          ),
        };
        return updated;
      }),
    })),

  setReplyingTo: (message) => set({ replyingTo: message }),

  setEditingMessage: (message) => set({ editingMessage: message }),

  removeConversation: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
    })),

  markConversationReadLocally: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  bindSocketEvents: () => {
    const socket = getSocket();
    if (!socket) return;

    // Remove existing to prevent double listeners
    socket.off('message:new');
    socket.off('message:updated');
    socket.off('message:deleted');
    socket.off('message:reaction_updated');
    socket.off('message:read_receipt');
    socket.off('user:typing');
    socket.off('user:stop_typing');
    socket.off('user:presence');
    socket.off('presence:initial');
    socket.off('user:profile_updated');

    socket.on('presence:initial', ({ onlineUserIds }: { onlineUserIds: string[] }) => {
      set((state) => {
        const next = { ...state.presence };
        for (const uid of onlineUserIds) {
          next[uid] = { ...next[uid], isOnline: true };
        }
        return { presence: next };
      });
    });

    socket.on('message:new', (message: Message) => {
      get().addMessage(message.conversationId, message);
      if (message.senderId) {
        get().setTyping(message.conversationId, message.senderId, '', false);
      }
    });

    socket.on('message:updated', (message: Message) => {
      get().updateMessage(message);
    });

    socket.on('message:deleted', (message: Message) => {
      get().updateMessage(message);
    });

    socket.on(
      'message:reaction_updated',
      ({ messageId, conversationId, reactions }: { messageId: string; conversationId: string; reactions: MessageReaction[] }) => {
        get().setReactions(messageId, conversationId, reactions);
      }
    );

    socket.on(
      'message:read_receipt',
      ({ conversationId }: { conversationId: string }) => {
        // Update statuses of messages in this conversation to READ
        set((state) => {
          const list = state.messages[conversationId] || [];
          return {
            messages: {
              ...state.messages,
              [conversationId]: list.map((m) => ({ ...m, status: 'READ' })),
            },
          };
        });
      }
    );

    socket.on(
      'user:typing',
      ({ conversationId, userId, displayName }: { conversationId: string; userId: string; displayName: string }) => {
        get().setTyping(conversationId, userId, displayName, true);
      }
    );

    socket.on(
      'user:stop_typing',
      ({ conversationId, userId }: { conversationId: string; userId: string }) => {
        get().setTyping(conversationId, userId, '', false);
      }
    );

    socket.on(
      'user:presence',
      ({ userId, isOnline, lastSeenAt }: { userId: string; isOnline: boolean; lastSeenAt?: string }) => {
        get().setPresence(userId, isOnline, lastSeenAt);
      }
    );

   socket.on(
  'user:profile_updated',
  ({
    userId,
    avatarUrl,
    displayName,
  }: {
    userId: string;
    avatarUrl?: string | null;
    displayName?: string;
  }) => {
    if (avatarUrl !== undefined) {
      get().updateUserAvatarInConversations(userId, avatarUrl ?? '');
    }
  }
);
  },
}));
