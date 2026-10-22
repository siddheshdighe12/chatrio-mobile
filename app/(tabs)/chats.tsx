import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';
import { Conversation, UserSummary } from '../../types/chat';
import { Avatar } from '../../components/Avatar';

function formatTime(isoString?: string) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ActionSheet({
  visible,
  conversation,
  onClose,
  onAction,
  C,
}: {
  visible: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  onAction: (action: string) => void;
  C: any;
}) {
  if (!conversation) return null;

  const isDirect = conversation.type === 'DIRECT';
  const isPinned = conversation.isPinned;
  const isMuted = conversation.isMuted;

  const actions = [
    { id: 'open', label: 'Open Chat', icon: 'chatbubble-outline' },
    { id: 'mark_unread', label: 'Mark as Unread', icon: 'ellipse-outline' },
    { id: 'pin', label: isPinned ? 'Unpin' : 'Pin to Top', icon: isPinned ? 'pin-outline' : 'pin' },
    { id: 'mute', label: isMuted ? 'Unmute' : 'Mute', icon: isMuted ? 'volume-high-outline' : 'volume-mute-outline' },
    { id: 'archive', label: 'Archive', icon: 'archive-outline' },
    ...(isDirect ? [
      { id: 'view_profile', label: 'View Profile', icon: 'person-outline' },
      { id: 'block', label: 'Block User', icon: 'ban-outline', destructive: true },
      { id: 'report', label: 'Report User', icon: 'flag-outline', destructive: true },
    ] : []),
    { id: 'clear', label: 'Clear Chat', icon: 'trash-outline', destructive: true },
    { id: 'delete', label: 'Delete Chat', icon: 'close-circle-outline', destructive: true },
  ];

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="fade">
      <Pressable style={styles.actionOverlay} onPress={onClose}>
        <Pressable>
          <View style={[styles.actionSheet, { backgroundColor: C.surface }]}>
            {/* Chat header info */}
            <View style={[styles.actionHeader, { borderBottomColor: C.border }]}>
              <Avatar
                avatarUrl={conversation.avatarUrl}
                displayName={conversation.name}
                size={40}
              />
              <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
                <Text style={[styles.actionTitle, { color: C.textPrimary }]} numberOfLines={1}>
                  {conversation.name}
                </Text>
                <Text style={[styles.actionSubtitle, { color: C.textSecondary }]}>
                  {isDirect ? 'Direct message' : `${conversation.members.length} members`}
                </Text>
              </View>
            </View>

            {actions.map((action, idx) => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.actionRow,
                  { borderBottomColor: C.divider },
                  idx < actions.length - 1 ? { borderBottomWidth: 1 } : {},
                ]}
                onPress={() => onAction(action.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={action.icon as any}
                  size={20}
                  color={action.destructive ? C.error : C.textSecondary}
                  style={{ marginRight: Spacing.md }}
                />
                <Text
                  style={[
                    styles.actionLabel,
                    { color: action.destructive ? C.error : C.textPrimary },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.actionCancel, { backgroundColor: C.backgroundTertiary }]}
              onPress={onClose}
            >
              <Text style={[styles.actionCancelText, { color: C.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// New Chat Modal
function NewChatModal({
  visible,
  onClose,
  onStartChat,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  onStartChat: (user: UserSummary) => void;
  C: any;
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.get('/users/search').then((r) => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [visible]);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: C.primary, fontSize: FontSize.base }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: C.textPrimary }]}>New Message</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={[styles.searchBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textTertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: C.inputText }]}
            placeholder="Search people..."
            placeholderTextColor={C.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.userRow, { borderBottomColor: C.divider }]}
                onPress={() => onStartChat(item)}
                activeOpacity={0.7}
              >
                <Avatar avatarUrl={item.avatarUrl} displayName={item.displayName} size={44} showOnlineIndicator isOnline={item.isOnline} />
                <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                  <Text style={[styles.userName, { color: C.textPrimary }]}>{item.displayName}</Text>
                  <Text style={[styles.userHandle, { color: C.textSecondary }]}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>
    </Modal>
  );
}

export default function ChatsScreen() {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authIsLoading, isAuthenticated } = useAuthStore();
  const {
    conversations,
    conversationsLoading,
    conversationsError,
    setConversations,
    setConversationsLoading,
    setConversationsError,
    addOrUpdateConversation,
    typingUsers,
    presence,
  } = useChatStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

  // Track whether we've done at least one successful load so we know
  // whether the empty state means "truly empty" vs "not yet loaded".
  const hasLoadedOnceRef = useRef(false);
  // Prevent concurrent in-flight requests.
  const fetchInFlightRef = useRef(false);

  const fetchConversations = useCallback(
    async (opts?: { isRefresh?: boolean; signal?: AbortSignal }) => {
      const { isRefresh = false, signal } = opts ?? {};

      // Don't start a new request if one is already running (unless it's a
      // pull-to-refresh, which is always intentional).
      if (!isRefresh && fetchInFlightRef.current) return;

      fetchInFlightRef.current = true;
      if (!isRefresh) {
        setConversationsLoading(true);
        setConversationsError(null);
      }

      try {
        const response = await api.get('/conversations', { signal });
        if (signal?.aborted) return;
        setConversations(response.data);
        setConversationsError(null);
        hasLoadedOnceRef.current = true;
      } catch (err: any) {
        // Ignore cancellation — it's intentional (e.g., component unmounted).
        if (err?.code === 'ERR_CANCELED' || signal?.aborted) return;
        console.warn('Failed to fetch conversations:', err?.message);
        setConversationsError(
          err?.response?.status === 401
            ? 'Session expired. Please restart the app.'
            : 'Could not load conversations. Check your connection.',
        );
      } finally {
        if (!signal?.aborted) {
          setConversationsLoading(false);
          fetchInFlightRef.current = false;
        }
      }
    },
    [setConversations, setConversationsLoading, setConversationsError],
  );

  // Fetch only after authentication is fully resolved, and only once per mount.
  useEffect(() => {
    // Wait until the auth loading phase is done.
    if (authIsLoading || !isAuthenticated) return;

    const controller = new AbortController();
    fetchConversations({ signal: controller.signal });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authIsLoading, isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations({ isRefresh: true });
    setRefreshing(false);
  };

  const startDirectChat = async (targetUser: UserSummary) => {
    setNewChatOpen(false);
    try {
      const res = await api.post('/conversations/direct', { targetUserId: targetUser.id });
      addOrUpdateConversation(res.data);
      router.push(`/chat/${res.data.id}`);
    } catch (err: any) {
      console.error('Failed to create direct chat:', err?.message);
    }
  };

  const handleConversationAction = async (action: string) => {
    if (!selectedConv) return;
    setSelectedConv(null);

    const conv = selectedConv;

    switch (action) {
      case 'open':
        router.push(`/chat/${conv.id}`);
        break;
      case 'mark_unread':
        try {
          await api.post(`/conversations/${conv.id}/unread`);
          setConversations(conversations.map((c) => c.id === conv.id ? { ...c, unreadCount: 1 } : c));
        } catch {}
        break;
      case 'pin':
        try {
          const res = await api.patch(`/conversations/${conv.id}/pin`);
          setConversations(conversations.map((c) => c.id === conv.id ? { ...c, isPinned: res.data.isPinned } : c));
        } catch {}
        break;
      case 'mute':
        try {
          const res = await api.patch(`/conversations/${conv.id}/mute`);
          setConversations(conversations.map((c) => c.id === conv.id ? { ...c, isMuted: res.data.isMuted } : c));
        } catch {}
        break;
      case 'archive':
        try {
          await api.patch(`/conversations/${conv.id}/archive`);
          setConversations(conversations.filter((c) => c.id !== conv.id));
        } catch {}
        break;
      case 'view_profile':
        if (conv.otherUser?.id) router.push(`/profile/${conv.otherUser.id}`);
        break;
      case 'block':
        Alert.alert('Block User', `Block ${conv.otherUser?.displayName || conv.name}? They won't be able to contact you.`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              if (conv.otherUser?.id) {
                try { await api.post(`/users/${conv.otherUser.id}/block`); } catch {}
              }
            },
          },
        ]);
        break;
      case 'report':
        Alert.alert('Report User', 'Why are you reporting this user?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Spam', onPress: async () => { try { await api.post(`/users/${conv.otherUser?.id}/report`, { reason: 'Spam' }); } catch {} } },
          { text: 'Harassment', onPress: async () => { try { await api.post(`/users/${conv.otherUser?.id}/report`, { reason: 'Harassment' }); } catch {} } },
          { text: 'Inappropriate', onPress: async () => { try { await api.post(`/users/${conv.otherUser?.id}/report`, { reason: 'Inappropriate content' }); } catch {} } },
        ]);
        break;
      case 'clear':
        Alert.alert('Clear Chat', 'Are you sure? This will remove all messages from your view.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.post(`/conversations/${conv.id}/clear`);
                setConversations(conversations.map((c) => c.id === conv.id ? { ...c, lastMessage: null } : c));
              } catch {}
            },
          },
        ]);
        break;
      case 'delete':
        Alert.alert('Delete Chat', 'This will remove the conversation from your chat list.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.delete(`/conversations/${conv.id}`);
                setConversations(conversations.filter((c) => c.id !== conv.id));
              } catch {}
            },
          },
        ]);
        break;
    }
  };

  const directConvs = conversations.filter((c) => c.type === 'DIRECT');
  const filteredConversations = directConvs.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.lastMessage?.content?.toLowerCase().includes(q)
    );
  });

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const otherUserId = item.otherUser?.id;
    const isOtherOnline = otherUserId ? (presence[otherUserId]?.isOnline ?? item.otherUser?.isOnline ?? false) : false;

    const convTyping = typingUsers[item.id] || {};
    const typingNames = Object.values(convTyping);
    const isSomeoneTyping = typingNames.length > 0;

    const lastMsg = item.lastMessage;
    let snippet = 'Start a conversation';
    if (isSomeoneTyping) {
      snippet = 'typing...';
    } else if (lastMsg) {
      if (lastMsg.type === 'IMAGE') snippet = '📷 Photo';
      else if (lastMsg.type === 'FILE') snippet = '📎 File';
      else if (lastMsg.type === 'DELETED') snippet = 'Message deleted';
      else snippet = lastMsg.content || '';
    }

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: C.background }]}
        activeOpacity={0.65}
        onPress={() => router.push(`/chat/${item.id}`)}
        onLongPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          setSelectedConv(item);
        }}
        delayLongPress={350}
      >
        <View style={{ marginRight: 14 }}>
          <Avatar
            avatarUrl={item.avatarUrl}
            displayName={item.name}
            username={item.otherUser?.username}
            size={54}
            showOnlineIndicator
            isOnline={isOtherOnline}
            badgeBorderColor={C.background}
          />
        </View>

        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              {item.isPinned && (
                <Ionicons name="pin" size={13} color={C.primary} style={{ marginRight: 5 }} />
              )}
              {item.isMuted && (
                <Ionicons name="volume-mute" size={13} color={C.textTertiary} style={{ marginRight: 5 }} />
              )}
              <Text style={[styles.name, { color: C.textPrimary }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={[styles.time, { color: item.unreadCount > 0 ? C.primary : C.textTertiary }]}>
              {formatTime(item.updatedAt)}
            </Text>
          </View>
          <View style={styles.rowFooter}>
            <Text
              style={[
                styles.snippet,
                {
                  fontStyle: isSomeoneTyping ? 'italic' : 'normal',
                  fontWeight: item.unreadCount > 0 ? '500' : '400',
                  color: isSomeoneTyping ? C.primary : item.unreadCount > 0 ? C.textPrimary : C.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {snippet}
            </Text>
            {item.unreadCount > 0 && !item.isMuted && (
              <View style={[styles.badge, { backgroundColor: C.primary }]}>
                <Text style={[styles.badgeText, { color: '#fff' }]}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
            {item.unreadCount > 0 && item.isMuted && (
              <View style={[styles.badge, { backgroundColor: C.textTertiary }]}>
                <Text style={[styles.badgeText, { color: C.surface }]}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: C.background,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Chats</Text>
        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setNewChatOpen(true);
          }}
          style={[styles.newBtn, { backgroundColor: C.primary }]}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={19} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: C.surfaceSecondary ?? C.inputBackground,
              borderColor: isSearchFocused ? C.primary : 'transparent',
              borderWidth: 1.5,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={isSearchFocused ? C.primary : C.textTertiary}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={[styles.searchInput, { color: C.inputText }]}
            placeholder="Search chats..."
            placeholderTextColor={C.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={C.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Conversations — loading / error / empty / list */}
      {conversationsLoading && !refreshing ? (
        // Initial load: show polished skeleton rows
        <View style={{ flex: 1, paddingTop: 4 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.row,
                { opacity: 1 - i * 0.1 },
              ]}
            >
              {/* Avatar skeleton */}
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: C.surfaceSecondary ?? C.inputBackground,
                  marginRight: 14,
                }}
              />
              <View style={{ flex: 1 }}>
                {/* Name skeleton */}
                <View
                  style={{
                    height: 14,
                    width: `${60 + (i % 3) * 12}%`,
                    borderRadius: 7,
                    backgroundColor: C.surfaceSecondary ?? C.inputBackground,
                    marginBottom: 8,
                  }}
                />
                {/* Snippet skeleton */}
                <View
                  style={{
                    height: 12,
                    width: `${40 + (i % 4) * 10}%`,
                    borderRadius: 6,
                    backgroundColor: C.surfaceSecondary ?? C.inputBackground,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : conversationsError ? (
        // Error state with retry
        <View style={styles.empty}>
          <View style={[styles.emptyIconCircle, { backgroundColor: C.surfaceSecondary ?? C.inputBackground }]}>
            <Ionicons name="cloud-offline-outline" size={40} color={C.error ?? '#EF4444'} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>Failed to load chats</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            {conversationsError}
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: C.primary }]}
            onPress={() => fetchConversations({ isRefresh: true })}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.base }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredConversations.length === 0 && hasLoadedOnceRef.current ? (
        // True empty state — only shown after a successful load confirms zero conversations
        <View style={styles.empty}>
          <View style={[styles.emptyIconCircle, { backgroundColor: C.surfaceSecondary ?? C.inputBackground }]}>
            <Ionicons name="chatbubbles-outline" size={40} color={C.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>No conversations yet</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            {searchQuery ? 'No chats match your search query.' : 'Tap the compose button above to start a conversation.'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: C.primary }]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setNewChatOpen(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.base }}>New Chat</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : filteredConversations.length > 0 ? (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: C.divider }]} />
          )}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
        />
      ) : null}

      {/* Long-Press Action Sheet */}
      <ActionSheet
        visible={!!selectedConv}
        conversation={selectedConv}
        onClose={() => setSelectedConv(null)}
        onAction={handleConversationAction}
        C={C}
      />

      {/* New Chat Modal */}
      <NewChatModal
        visible={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStartChat={startDirectChat}
        C={C}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  newBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 10,
    paddingTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  rowContent: { flex: 1 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, flex: 1, marginRight: 8 },
  time: { fontSize: 12, fontWeight: '400' },
  snippet: { flex: 1, fontSize: 14, marginRight: 8, lineHeight: 18 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 84 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['2xl'], paddingBottom: 60 },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  // Action sheet
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingBottom: 34,
    overflow: 'hidden',
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  actionTitle: { fontSize: FontSize.base, fontWeight: '700' },
  actionSubtitle: { fontSize: FontSize.xs, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  actionLabel: { fontSize: FontSize.base },
  actionCancel: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: Radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionCancelText: { fontSize: FontSize.base, fontWeight: '600' },
  // New chat modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  userName: { fontSize: FontSize.base, fontWeight: '600' },
  userHandle: { fontSize: FontSize.sm },
});
