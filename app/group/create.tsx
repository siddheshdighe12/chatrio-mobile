import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { LightColors, DarkColors } from '../../constants/Colors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chatStore';
import { UserSummary } from '../../types/chat';
import { Avatar } from '../../components/Avatar';

export default function CreateGroupScreen() {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DarkColors : LightColors;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { addOrUpdateConversation } = useChatStore();

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await api.get('/users/search');
      setAvailableUsers(res.data);
    } catch (err: any) {
      console.warn('Failed to fetch users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const toggleUser = (id: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedUserIds(next);
  };

  const handlePickGroupAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Need photo library access to choose a group photo');
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
    const formData = new FormData();
    const uri = asset.uri;
    const filename = uri.split('/').pop() || 'group_avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', { uri, name: filename, type: mimeType } as any);

    setIsUploadingAvatar(true);
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setGroupAvatarUrl(res.data.url);
    } catch (err: any) {
      Alert.alert('Upload Error', err?.message || 'Failed to upload group photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Required', 'Please enter a group name');
      return;
    }

    if (selectedUserIds.size === 0) {
      Alert.alert('Required', 'Please select at least 1 member for the group');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/conversations/group', {
        name: groupName.trim(),
        description: description.trim() || undefined,
        avatarUrl: groupAvatarUrl || undefined,
        memberIds: Array.from(selectedUserIds),
      });

      const newGroup = res.data;
      addOrUpdateConversation(newGroup);

      router.replace(`/chat/${newGroup.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedUsersList = availableUsers.filter((u) => selectedUserIds.has(u.id));

  const filteredUsers = availableUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: C.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>New Group</Text>
        <TouchableOpacity
          onPress={handleCreateGroup}
          disabled={isSubmitting || !groupName.trim() || selectedUserIds.size === 0}
          style={[
            styles.createBtn,
            { opacity: !groupName.trim() || selectedUserIds.size === 0 ? 0.5 : 1 },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <Text style={[styles.createText, { color: C.primary }]}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Group Info Inputs */}
      <View style={[styles.infoSection, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          style={[styles.groupAvatarPreview, { backgroundColor: C.primary + '20' }]}
          onPress={handlePickGroupAvatar}
          disabled={isUploadingAvatar}
          activeOpacity={0.8}
        >
          {isUploadingAvatar ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : groupAvatarUrl ? (
            <Image source={{ uri: groupAvatarUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 32 }}>👥</Text>
          )}
        </TouchableOpacity>

        <View style={{ flex: 1, gap: Spacing.sm }}>
          <TextInput
            style={[styles.input, { backgroundColor: C.inputBackground, color: C.inputText, borderColor: C.inputBorder }]}
            placeholder="Group Name"
            placeholderTextColor={C.inputPlaceholder}
            value={groupName}
            onChangeText={setGroupName}
            maxLength={60}
          />
          <TextInput
            style={[styles.input, { backgroundColor: C.inputBackground, color: C.inputText, borderColor: C.inputBorder }]}
            placeholder="Description (optional)"
            placeholderTextColor={C.inputPlaceholder}
            value={description}
            onChangeText={setDescription}
            maxLength={250}
          />
        </View>
      </View>

      {/* Selected Members Chips */}
      {selectedUsersList.length > 0 && (
        <View style={[styles.chipsContainer, { borderBottomColor: C.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {selectedUsersList.map((u) => (
              <View
                key={u.id}
                style={[styles.chip, { backgroundColor: C.surface, borderColor: C.primary }]}
              >
                <Avatar
                  avatarUrl={u.avatarUrl}
                  displayName={u.displayName}
                  username={u.username}
                  size={24}
                />
                <Text style={[styles.chipName, { color: C.textPrimary }]} numberOfLines={1}>
                  {u.displayName}
                </Text>
                <TouchableOpacity onPress={() => toggleUser(u.id)} style={styles.chipRemove}>
                  <Text style={{ fontSize: 14, color: C.textTertiary }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search Members Bar */}
      <View style={[styles.searchBar, { backgroundColor: C.inputBackground, borderColor: C.inputBorder }]}>
        <Text style={{ fontSize: 16, marginRight: Spacing.sm }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: C.inputText }]}
          placeholder="Search participants..."
          placeholderTextColor={C.inputPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* User Selection List */}
      {isLoadingUsers ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] }}
          renderItem={({ item }) => {
            const isSelected = selectedUserIds.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.userRow, { backgroundColor: C.surface, borderColor: C.border }]}
                activeOpacity={0.7}
                onPress={() => toggleUser(item.id)}
              >
                <Avatar
                  avatarUrl={item.avatarUrl}
                  displayName={item.displayName}
                  username={item.username}
                  size={44}
                />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={[styles.userName, { color: C.textPrimary }]}>{item.displayName}</Text>
                  <Text style={[styles.userHandle, { color: C.textSecondary }]}>@{item.username}</Text>
                </View>

                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isSelected ? C.primary : C.border,
                      backgroundColor: isSelected ? C.primary : 'transparent',
                    },
                  ]}
                >
                  {isSelected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  cancelBtn: { padding: Spacing.xs },
  cancelText: { fontSize: FontSize.base },
  createBtn: { padding: Spacing.xs },
  createText: { fontSize: FontSize.base, fontWeight: '700' },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  groupAvatarPreview: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
  },
  chipsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  chipName: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    maxWidth: 100,
  },
  chipRemove: {
    padding: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    height: '100%',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  userName: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  userHandle: {
    fontSize: FontSize.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
