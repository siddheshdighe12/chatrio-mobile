import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
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
import { Conversation } from '../../types/chat';
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
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function GroupsScreen() {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { conversations, setConversations, typingUsers } = useChatStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const groups = conversations.filter((c) => c.type === 'GROUP');

  const fetchConversations = useCallback(async () => {
    try {
      const response = await api.get('/conversations');
      setConversations(response.data);
    } catch (err: any) {
      console.warn('Failed to fetch conversations:', err?.message);
    }
  }, [setConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const filteredGroups = groups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.lastMessage?.content?.toLowerCase().includes(q)
    );
  });

  const renderGroupItem = ({ item }: { item: Conversation }) => {
    const convTyping = typingUsers[item.id] || {};
    const typingNames = Object.values(convTyping).filter((n) => n !== user?.displayName);
    const isSomeoneTyping = typingNames.length > 0;

    const lastMsg = item.lastMessage;
    let snippet = 'No messages yet';
    if (isSomeoneTyping) {
      snippet = `${typingNames[0]} is typing...`;
    } else if (lastMsg) {
      if (lastMsg.type === 'IMAGE') snippet = '📷 Photo';
      else if (lastMsg.type === 'FILE') snippet = '📎 File';
      else if (lastMsg.type === 'DELETED') snippet = 'Message deleted';
      else if (lastMsg.type === 'SYSTEM') snippet = lastMsg.content || '';
      else if (lastMsg.senderName) snippet = `${lastMsg.senderName}: ${lastMsg.content || ''}`;
      else snippet = lastMsg.content || '';
    }

    const memberCount = item.members.length;

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: C.background }]}
        activeOpacity={0.65}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={{ marginRight: 14 }}>
          <Avatar
            avatarUrl={item.avatarUrl}
            displayName={item.name}
            size={54}
            showOnlineIndicator={false}
          />
        </View>

        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={[styles.name, { color: C.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.time, { color: item.unreadCount > 0 ? C.primary : C.textTertiary }]}>
              {formatTime(item.updatedAt)}
            </Text>
          </View>
          <View style={styles.rowFooter}>
            <Text
              style={[
                styles.snippet,
                {
                  color: isSomeoneTyping ? C.primary : item.unreadCount > 0 ? C.textPrimary : C.textSecondary,
                  fontStyle: isSomeoneTyping ? 'italic' : 'normal',
                  fontWeight: item.unreadCount > 0 ? '500' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {snippet}
            </Text>
            {item.unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: C.primary }]}>
                <Text style={[styles.badgeText, { color: '#fff' }]}>
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
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Groups</Text>
        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            router.push('/group/create');
          }}
          style={[styles.newBtn, { backgroundColor: C.primary }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#fff" />
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
            placeholder="Search groups..."
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

      {/* List */}
      {filteredGroups.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIconCircle, { backgroundColor: C.surfaceSecondary ?? C.inputBackground }]}>
            <Ionicons name="people-outline" size={40} color={C.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>No groups yet</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            {searchQuery ? 'No groups match your search query.' : 'Create a group to start a conversation with multiple people.'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: C.primary }]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                router.push('/group/create');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.base }}>Create Group</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: C.divider }]} />
          )}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
        />
      )}
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
});
