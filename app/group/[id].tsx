import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  Switch,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Conversation, UserSummary } from '../../types/chat';
import { Avatar } from '../../components/Avatar';

interface MemberItem {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isActive: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  user: UserSummary;
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useThemeColors();

  const { user } = useAuthStore();
  const { presence, removeConversation, addOrUpdateConversation } = useChatStore();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit group details state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Add members state
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  // Member action sheet state
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const fetchGroupDetails = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const res = await api.get(`/conversations/${id}`);
      setConversation(res.data);
      if (res.data.members) {
        setMembers(res.data.members.filter((m: MemberItem) => m.isActive !== false));
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to load group details');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  // Real-time synchronization
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !id) return;

    socket.emit('conversation:join', id);

    const onConversationUpdated = (updatedConv: Conversation) => {
      if (updatedConv.id === id) {
        setConversation((prev) => (prev ? { ...prev, ...updatedConv } : updatedConv));
        addOrUpdateConversation(updatedConv);
      }
    };

    const onMembersUpdated = (payload: { conversationId: string; event: string; userId?: string }) => {
      if (payload.conversationId === id) {
        if (payload.event === 'MEMBER_REMOVED' && payload.userId === user?.id) {
          Alert.alert('Notice', 'You have been removed from this group.');
          removeConversation(id);
          router.replace('/(tabs)/groups' as any);
        } else {
          fetchGroupDetails();
        }
      }
    };

    socket.on('conversation:updated', onConversationUpdated);
    socket.on('conversation:members_updated', onMembersUpdated);

    return () => {
      socket.off('conversation:updated', onConversationUpdated);
      socket.off('conversation:members_updated', onMembersUpdated);
    };
  }, [id, fetchGroupDetails, user?.id, addOrUpdateConversation, removeConversation, router]);

  // Check current user role
  const myMembership = members.find((m) => m.userId === user?.id);
  const isOwner = myMembership?.role === 'OWNER';
  const isAdmin = isOwner || myMembership?.role === 'ADMIN';

  const handlePickAvatar = async () => {
    if (!isAdmin) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo library access to set group photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const filename = uri.split('/').pop() || 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: mimeType } as any);

    setIsUploadingAvatar(true);
    try {
      const uploadRes = await api.post('/upload', formData);
      const newAvatarUrl = uploadRes.data.url;
      const updateRes = await api.patch(`/conversations/${id}`, { avatarUrl: newAvatarUrl });
      setConversation(updateRes.data);
      addOrUpdateConversation(updateRes.data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.error || err.message || 'Could not upload photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Group name cannot be empty');
      return;
    }

    setIsSavingDetails(true);
    try {
      const res = await api.patch(`/conversations/${id}`, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setConversation(res.data);
      addOrUpdateConversation(res.data);
      setIsEditModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to update group');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleToggleMute = async () => {
    try {
      const res = await api.patch(`/conversations/${id}/mute`);
      const updated = { ...conversation!, isMuted: res.data.isMuted };
      setConversation(updated);
      addOrUpdateConversation(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update notifications');
    }
  };

  const openAddMembers = async () => {
    setIsAddMemberModalOpen(true);
    setIsLoadingUsers(true);
    setSelectedUserIds(new Set());
    setSearchQuery('');
    try {
      const res = await api.get('/users/search');
      // Filter out current members
      const existingMemberUserIds = new Set(members.map((m) => m.userId));
      const available = res.data.filter((u: UserSummary) => !existingMemberUserIds.has(u.id));
      setAvailableUsers(available);
    } catch (err: any) {
      console.warn('Failed to search users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const toggleSelectUser = (uid: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    setSelectedUserIds(next);
  };

  const handleAddMembersSubmit = async () => {
    if (selectedUserIds.size === 0) return;
    setIsAddingMembers(true);
    try {
      await api.post(`/conversations/${id}/members`, {
        userIds: Array.from(selectedUserIds),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsAddMemberModalOpen(false);
      await fetchGroupDetails();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to add members');
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleRoleChange = async (member: MemberItem, newRole: 'ADMIN' | 'MEMBER') => {
    setSelectedMember(null);
    try {
      await api.patch(`/conversations/${id}/members/${member.userId}`, { role: newRole });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await fetchGroupDetails();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to change member role');
    }
  };

  const handleRemoveMember = (member: MemberItem) => {
    setSelectedMember(null);
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.user?.displayName || 'this member'} from the group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/conversations/${id}/members/${member.userId}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await fetchGroupDetails();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/conversations/${id}/leave`);
            removeConversation(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/(tabs)/groups' as any);
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to leave group');
          }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This will remove all messages and members permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Group',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/conversations/${id}`);
              removeConversation(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace('/(tabs)/groups' as any);
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const filteredAvailableUsers = availableUsers.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]} numberOfLines={1}>
          Group Info
        </Text>
        {isAdmin ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              setEditName(conversation?.name || '');
              setEditDescription(conversation?.description || '');
              setIsEditModalOpen(true);
            }}
          >
            <Ionicons name="create-outline" size={22} color={C.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : conversation ? (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing['4xl'] }}>
          {/* Group Profile Card */}
          <View style={[styles.profileCard, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (conversation.avatarUrl) {
                  setPreviewAvatar(conversation.avatarUrl);
                } else if (isAdmin) {
                  handlePickAvatar();
                }
              }}
              style={styles.avatarContainer}
            >
              <Avatar
                avatarUrl={conversation.avatarUrl}
                displayName={conversation.name}
                size={96}
                badgeBorderColor={C.surface}
              />
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.cameraBadge, { backgroundColor: C.primary }]}
                  onPress={handlePickAvatar}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <Text style={[styles.groupName, { color: C.textPrimary }]}>{conversation.name}</Text>
            <Text style={[styles.groupMeta, { color: C.textSecondary }]}>
              Group · {members.length} {members.length === 1 ? 'member' : 'members'}
            </Text>

            {conversation.description ? (
              <View style={[styles.descBox, { backgroundColor: C.backgroundSecondary, borderColor: C.border }]}>
                <Text style={[styles.descText, { color: C.textPrimary }]}>{conversation.description}</Text>
              </View>
            ) : null}
          </View>

          {/* Quick Actions (Mute) */}
          <View style={[styles.section, { backgroundColor: C.surface, borderTopColor: C.border, borderBottomColor: C.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelRow}>
                <Ionicons
                  name={conversation.isMuted ? 'notifications-off-outline' : 'notifications-outline'}
                  size={22}
                  color={conversation.isMuted ? C.textTertiary : C.primary}
                />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Mute Notifications</Text>
              </View>
              <Switch
                value={conversation.isMuted ?? false}
                onValueChange={handleToggleMute}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Members Section */}
          <View style={[styles.sectionHeader]}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>
              MEMBERS ({members.length})
            </Text>
            {isAdmin && (
              <TouchableOpacity style={styles.addMemberBtn} onPress={openAddMembers}>
                <Ionicons name="person-add-outline" size={18} color={C.primary} />
                <Text style={[styles.addMemberText, { color: C.primary }]}>Add Members</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.membersList, { backgroundColor: C.surface, borderTopColor: C.border, borderBottomColor: C.border }]}>
            {members.map((item, index) => {
              const isItemMe = item.userId === user?.id;
              const isItemOnline = presence[item.userId]?.isOnline ?? item.user?.isOnline ?? false;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.memberRow,
                    index < members.length - 1 && { borderBottomColor: C.border, borderBottomWidth: 1 },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.memberInfo}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!isItemMe) {
                        router.push(`/profile/${item.userId}` as any);
                      }
                    }}
                  >
                    <Avatar
                      avatarUrl={item.user?.avatarUrl}
                      displayName={item.user?.displayName}
                      username={item.user?.username}
                      size={44}
                      showOnlineIndicator={true}
                      isOnline={isItemOnline}
                      badgeBorderColor={C.surface}
                    />
                    <View style={styles.memberTextContainer}>
                      <Text style={[styles.memberName, { color: C.textPrimary }]} numberOfLines={1}>
                        {item.user?.displayName} {isItemMe && <Text style={{ color: C.primary }}>(You)</Text>}
                      </Text>
                      <Text style={[styles.memberUsername, { color: C.textSecondary }]}>
                        @{item.user?.username}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.memberRight}>
                    {item.role !== 'MEMBER' && (
                      <View
                        style={[
                          styles.roleBadge,
                          {
                            backgroundColor:
                              item.role === 'OWNER' ? C.primary + '20' : C.primaryDark + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            { color: item.role === 'OWNER' ? C.primary : C.primaryDark },
                          ]}
                        >
                          {item.role}
                        </Text>
                      </View>
                    )}

                    {/* Show action options: owner can manage admins and members; admin can manage members only */}
                    {((isOwner && !isItemMe) || (isAdmin && !isItemMe && item.role === 'MEMBER')) && (
                      <TouchableOpacity
                        style={styles.moreBtn}
                        onPress={() => setSelectedMember(item)}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={C.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Danger Zone Actions */}
          <View style={[styles.dangerSection, { backgroundColor: C.surface, borderTopColor: C.border, borderBottomColor: C.border }]}>
            <TouchableOpacity style={styles.dangerRow} onPress={handleLeaveGroup}>
              <Ionicons name="exit-outline" size={22} color={C.error} />
              <Text style={[styles.dangerText, { color: C.error }]}>Leave Group</Text>
            </TouchableOpacity>

            {isOwner && (
              <TouchableOpacity
                style={[styles.dangerRow, { borderTopColor: C.border, borderTopWidth: 1 }]}
                onPress={handleDeleteGroup}
              >
                <Ionicons name="trash-outline" size={22} color={C.error} />
                <Text style={[styles.dangerText, { color: C.error }]}>Delete Group</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : null}

      {/* Edit Group Modal */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent onRequestClose={() => setIsEditModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsEditModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.textPrimary }]}>Edit Group</Text>

            <Text style={[styles.inputLabel, { color: C.textSecondary }]}>Group Name</Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: C.inputBackground, color: C.inputText, borderColor: C.inputBorder },
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter group name"
              placeholderTextColor={C.inputPlaceholder}
            />

            <Text style={[styles.inputLabel, { color: C.textSecondary, marginTop: Spacing.md }]}>
              Description
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: C.inputBackground,
                  color: C.inputText,
                  borderColor: C.inputBorder,
                  height: 80,
                  textAlignVertical: 'top',
                },
              ]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="What is this group about?"
              placeholderTextColor={C.inputPlaceholder}
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.backgroundTertiary }]}
                onPress={() => setIsEditModalOpen(false)}
              >
                <Text style={[styles.modalBtnText, { color: C.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.primary }]}
                onPress={handleSaveDetails}
                disabled={isSavingDetails}
              >
                {isSavingDetails ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Members Modal */}
      <Modal visible={isAddMemberModalOpen} animationType="slide" onRequestClose={() => setIsAddMemberModalOpen(false)}>
        <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
          <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => setIsAddMemberModalOpen(false)} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Add Members</Text>
            <TouchableOpacity
              onPress={handleAddMembersSubmit}
              disabled={selectedUserIds.size === 0 || isAddingMembers}
              style={[styles.headerBtn, selectedUserIds.size === 0 && { opacity: 0.4 }]}
            >
              {isAddingMembers ? (
                <ActivityIndicator color={C.primary} size="small" />
              ) : (
                <Text style={{ color: C.primary, fontWeight: '700', fontSize: FontSize.base }}>
                  Add ({selectedUserIds.size})
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <Ionicons name="search" size={18} color={C.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: C.inputText }]}
              placeholder="Search people..."
              placeholderTextColor={C.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {isLoadingUsers ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredAvailableUsers}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => {
                const isSelected = selectedUserIds.has(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.userSelectRow, { borderBottomColor: C.border }]}
                    onPress={() => toggleSelectUser(item.id)}
                    activeOpacity={0.7}
                  >
                    <Avatar
                      avatarUrl={item.avatarUrl}
                      displayName={item.displayName}
                      username={item.username}
                      size={44}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.memberName, { color: C.textPrimary }]}>{item.displayName}</Text>
                      <Text style={[styles.memberUsername, { color: C.textSecondary }]}>@{item.username}</Text>
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={isSelected ? C.primary : C.border}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={[styles.center, { marginTop: 40 }]}>
                  <Text style={{ color: C.textSecondary }}>No new users found</Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>

      {/* Member Action Bottom Sheet */}
      <Modal visible={!!selectedMember} transparent animationType="fade" onRequestClose={() => setSelectedMember(null)}>
        <Pressable style={styles.actionOverlay} onPress={() => setSelectedMember(null)}>
          <View style={[styles.actionSheet, { backgroundColor: C.surface }]}>
            <View style={[styles.actionHeader, { borderBottomColor: C.border }]}>
              <Text style={[styles.actionMemberName, { color: C.textPrimary }]}>
                {selectedMember?.user?.displayName}
              </Text>
              <Text style={[styles.actionMemberSub, { color: C.textSecondary }]}>
                Role: {selectedMember?.role}
              </Text>
            </View>

            {/* Promote / Demote */}
            {selectedMember?.role === 'MEMBER' ? (
              <TouchableOpacity
                style={[styles.actionOption, { borderBottomColor: C.border }]}
                onPress={() => selectedMember && handleRoleChange(selectedMember, 'ADMIN')}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color={C.primary} />
                <Text style={[styles.actionOptionText, { color: C.textPrimary }]}>Make Group Admin</Text>
              </TouchableOpacity>
            ) : selectedMember?.role === 'ADMIN' && isOwner ? (
              <TouchableOpacity
                style={[styles.actionOption, { borderBottomColor: C.border }]}
                onPress={() => selectedMember && handleRoleChange(selectedMember, 'MEMBER')}
              >
                <Ionicons name="arrow-down-circle-outline" size={20} color={C.textSecondary} />
                <Text style={[styles.actionOptionText, { color: C.textPrimary }]}>Dismiss as Admin</Text>
              </TouchableOpacity>
            ) : null}

            {/* Remove from Group */}
            <TouchableOpacity
              style={[styles.actionOption, { borderBottomColor: C.border }]}
              onPress={() => selectedMember && handleRemoveMember(selectedMember)}
            >
              <Ionicons name="person-remove-outline" size={20} color={C.error} />
              <Text style={[styles.actionOptionText, { color: C.error }]}>Remove from Group</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCancelBtn, { backgroundColor: C.backgroundTertiary }]}
              onPress={() => setSelectedMember(null)}
            >
              <Text style={[styles.actionCancelText, { color: C.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Avatar Lightbox */}
      <Modal visible={!!previewAvatar} transparent animationType="fade" onRequestClose={() => setPreviewAvatar(null)}>
        <View style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setPreviewAvatar(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewAvatar && (
            <Image source={{ uri: previewAvatar }} style={styles.lightboxImage} contentFit="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  profileCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  avatarContainer: { position: 'relative', marginBottom: Spacing.md },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  groupName: { fontSize: FontSize['2xl'], fontWeight: '800', textAlign: 'center' },
  groupMeta: { fontSize: FontSize.sm, marginTop: 4 },
  descBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    width: '100%',
  },
  descText: { fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  section: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  settingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontSize: FontSize.base, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMemberText: { fontSize: FontSize.sm, fontWeight: '600' },
  membersList: { borderTopWidth: 1, borderBottomWidth: 1 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
  },
  memberInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  memberTextContainer: { marginLeft: Spacing.md, flex: 1 },
  memberName: { fontSize: FontSize.base, fontWeight: '600' },
  memberUsername: { fontSize: FontSize.xs, marginTop: 2 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '800' },
  moreBtn: { padding: 4 },
  dangerSection: {
    marginTop: Spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  dangerText: { fontSize: FontSize.base, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: { borderRadius: Radius['2xl'], padding: Spacing.xl },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', marginBottom: Spacing.lg },
  inputLabel: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: Spacing.xl },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: FontSize.base, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, fontSize: FontSize.base, paddingVertical: 4 },
  userSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 4,
    borderBottomWidth: 1,
  },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    overflow: 'hidden',
  },
  actionHeader: { padding: Spacing.lg, borderBottomWidth: 1, alignItems: 'center' },
  actionMemberName: { fontSize: FontSize.base, fontWeight: '700' },
  actionMemberSub: { fontSize: FontSize.xs, marginTop: 2 },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: 12,
    borderBottomWidth: 1,
  },
  actionOptionText: { fontSize: FontSize.base, fontWeight: '500' },
  actionCancelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionCancelText: { fontSize: FontSize.base, fontWeight: '600' },
  lightbox: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  lightboxImage: { width: '100%', height: '80%' },
});
