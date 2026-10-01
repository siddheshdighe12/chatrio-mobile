import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { api } from '../../lib/api';
import { unregisterPushTokenAsync } from '../../lib/notifications';
import { Avatar } from '../../components/Avatar';
import { UserSummary } from '../../types/chat';

type ThemeMode = 'system' | 'light' | 'dark';

export default function SettingsScreen() {
  const C = useThemeColors();
  const { user, updateUser, clearAuth } = useAuthStore();
  const { mode, setMode } = useThemeStore();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [readReceipts, setReadReceipts] = useState(user?.showReadReceipts ?? true);
  const [typingStatus, setTypingStatus] = useState(user?.showTypingStatus ?? true);

  // Blocked users state
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<UserSummary[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);

  const themeOptions: { label: string; value: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
  ];

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out of Chatrio?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await unregisterPushTokenAsync();
          } catch {}
          try {
            await api.post('/auth/logout');
          } catch {}
          await clearAuth();
        },
      },
    ]);
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo library access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
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

    setIsUploadingPhoto(true);
    try {
      const res = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser({ avatarUrl: res.data.avatarUrl });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.error || err.message || 'Could not upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setIsUploadingPhoto(true);
    try {
      await api.delete('/users/avatar');
      updateUser({ avatarUrl: null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Could not remove photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAvatarPress = () => {
    if (user?.avatarUrl && !user.avatarUrl.includes('dicebear.com')) {
      Alert.alert('Profile Photo', 'Choose an option', [
        { text: 'Choose from Library', onPress: handlePickPhoto },
        { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      handlePickPhoto();
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('Required', 'Display name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.patch('/users/profile', {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
      });

      updateUser({
        displayName: res.data.displayName,
        bio: res.data.bio,
      });

      setIsEditModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleReadReceipts = async (val: boolean) => {
    setReadReceipts(val);
    try {
      await api.patch('/users/profile', { showReadReceipts: val });
      updateUser({ showReadReceipts: val });
    } catch {}
  };

  const handleToggleTypingStatus = async (val: boolean) => {
    setTypingStatus(val);
    try {
      await api.patch('/users/profile', { showTypingStatus: val });
      updateUser({ showTypingStatus: val });
    } catch {}
  };

  const openBlockedUsers = async () => {
    setIsBlockedModalOpen(true);
    setIsLoadingBlocked(true);
    try {
      const res = await api.get('/users/blocked');
      setBlockedUsers(res.data);
    } catch (err: any) {
      console.warn('Failed to fetch blocked users:', err);
    } finally {
      setIsLoadingBlocked(false);
    }
  };

  const handleUnblockUser = async (targetId: string, targetName: string) => {
    Alert.alert('Unblock User', `Are you sure you want to unblock ${targetName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await api.delete(`/users/${targetId}/block`);
            setBlockedUsers((prev) => prev.filter((u) => u.id !== targetId));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: any) {
            Alert.alert('Error', 'Failed to unblock user');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing['4xl'] }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Settings</Text>
        </View>

        {/* Account Profile Card */}
        <View style={[styles.section, { borderBottomColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>ACCOUNT</Text>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
            activeOpacity={0.8}
            onPress={() => {
              setDisplayName(user?.displayName || '');
              setBio(user?.bio || '');
              setIsEditModalOpen(true);
            }}
          >
            <Avatar
              avatarUrl={user?.avatarUrl}
              displayName={user?.displayName}
              username={user?.username}
              size={60}
              badgeBorderColor={C.surface}
            />
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: C.textPrimary }]}>
                {user?.displayName ?? 'Your Name'}
              </Text>
              <Text style={[styles.cardSubtitle, { color: C.textSecondary }]}>
                @{user?.username ?? 'username'}
              </Text>
              {user?.bio && (
                <Text style={[styles.bioText, { color: C.textTertiary }]} numberOfLines={2}>
                  {user.bio}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Appearance Theme Selector */}
        <View style={[styles.section, { borderBottomColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>APPEARANCE</Text>
          <View style={[styles.themeRow, { backgroundColor: C.surface, borderColor: C.border }]}>
            {themeOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  mode === opt.value && [styles.themeOptionActive, { backgroundColor: C.primary }],
                ]}
                onPress={() => {
                  setMode(opt.value);
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={mode === opt.value ? C.primaryText : C.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.themeOptionText,
                    { color: mode === opt.value ? C.primaryText : C.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Privacy */}
        <View style={[styles.section, { borderBottomColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>PRIVACY & CHAT</Text>
          <View style={[styles.listCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.listRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.listRowText, { color: C.textPrimary }]}>Read Receipts</Text>
                <Text style={[styles.listRowSubtext, { color: C.textTertiary }]}>
                  Let others know when you have read their messages
                </Text>
              </View>
              <Switch
                value={readReceipts}
                onValueChange={handleToggleReadReceipts}
                trackColor={{ false: C.inputBackground, true: C.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <View style={styles.listRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.listRowText, { color: C.textPrimary }]}>Typing Status</Text>
                <Text style={[styles.listRowSubtext, { color: C.textTertiary }]}>
                  Show when you are typing in chats
                </Text>
              </View>
              <Switch
                value={typingStatus}
                onValueChange={handleToggleTypingStatus}
                trackColor={{ false: C.inputBackground, true: C.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: C.border }]} />

            {/* Blocked Users row */}
            <TouchableOpacity style={styles.listRow} onPress={openBlockedUsers} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listRowText, { color: C.textPrimary }]}>Blocked Contacts</Text>
                <Text style={[styles.listRowSubtext, { color: C.textTertiary }]}>
                  View and manage blocked accounts
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={[styles.section, { borderBottomColor: C.border }]}>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>ABOUT CHATRIO</Text>
          <View style={[styles.listCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.listRow}>
              <Text style={[styles.listRowText, { color: C.textPrimary }]}>Version</Text>
              <Text style={[styles.listRowValue, { color: C.textSecondary }]}>1.0.0 (Production Core)</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: C.border }]} />
            <View style={styles.listRow}>
              <Text style={[styles.listRowText, { color: C.textPrimary }]}>Realtime Engine</Text>
              <Text style={[styles.listRowValue, { color: C.textSecondary }]}>Socket.IO + Fastify</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: C.error + '15', borderColor: C.error + '30' }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={C.error} style={{ marginRight: 8 }} />
            <Text style={[styles.logoutText, { color: C.error }]}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border, backgroundColor: C.surface }]}>
            <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
              <Text style={{ fontSize: 16, color: C.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.textPrimary }]}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSaveProfile} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Avatar Picker */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={handleAvatarPress}
              disabled={isUploadingPhoto}
              activeOpacity={0.8}
              style={styles.avatarPickerBtn}
            >
              {isUploadingPhoto ? (
                <View
                  style={[
                    styles.avatarUploadOverlay,
                    { backgroundColor: C.primary + '20', borderRadius: 52 },
                  ]}
                >
                  <ActivityIndicator size="large" color={C.primary} />
                </View>
              ) : (
                <Avatar
                  avatarUrl={user?.avatarUrl}
                  displayName={user?.displayName}
                  username={user?.username}
                  size={104}
                  badgeBorderColor={C.background}
                />
              )}
              <View style={[styles.cameraBadge, { backgroundColor: C.primary, borderColor: C.background }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={[styles.avatarHint, { color: C.textSecondary }]}>
              {user?.avatarUrl && !user.avatarUrl.includes('dicebear.com')
                ? 'Tap to change or remove photo'
                : 'Tap to add profile photo'}
            </Text>
          </View>

          <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <View>
              <Text style={[styles.inputLabel, { color: C.textSecondary }]}>DISPLAY NAME</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    color: C.inputText,
                  },
                ]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={C.inputPlaceholder}
                maxLength={40}
              />
            </View>

            <View>
              <Text style={[styles.inputLabel, { color: C.textSecondary }]}>ABOUT / BIO</Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.textArea,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    color: C.inputText,
                  },
                ]}
                value={bio}
                onChangeText={setBio}
                placeholder="Write something about yourself..."
                placeholderTextColor={C.inputPlaceholder}
                multiline
                numberOfLines={3}
                maxLength={160}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Blocked Users Modal */}
      <Modal
        visible={isBlockedModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsBlockedModalOpen(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: C.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border, backgroundColor: C.surface }]}>
            <TouchableOpacity onPress={() => setIsBlockedModalOpen(false)}>
              <Text style={{ fontSize: 16, color: C.primary, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.textPrimary }]}>Blocked Contacts</Text>
            <View style={{ width: 40 }} />
          </View>

          {isLoadingBlocked ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : (
            <FlatList
              data={blockedUsers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => (
                <View style={[styles.blockedUserRow, { borderBottomColor: C.border, backgroundColor: C.surface }]}>
                  <Avatar
                    avatarUrl={item.avatarUrl}
                    displayName={item.displayName}
                    username={item.username}
                    size={44}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.blockedName, { color: C.textPrimary }]}>{item.displayName}</Text>
                    <Text style={[styles.blockedUsername, { color: C.textSecondary }]}>@{item.username}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.unblockBtn, { backgroundColor: C.backgroundSecondary, borderColor: C.border }]}
                    onPress={() => handleUnblockUser(item.id, item.displayName)}
                  >
                    <Text style={[styles.unblockBtnText, { color: C.error }]}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={[styles.center, { marginTop: 60, paddingHorizontal: Spacing.xl }]}>
                  <Ionicons name="shield-checkmark-outline" size={48} color={C.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: C.textPrimary, marginTop: 12 }]}>
                    No Blocked Contacts
                  </Text>
                  <Text style={[styles.emptySub, { color: C.textSecondary, textAlign: 'center', marginTop: 4 }]}>
                    When you block someone, they won't be able to send you messages or view your presence.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  cardBody: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  bioText: {
    fontSize: FontSize.xs,
    marginTop: 4,
    lineHeight: 16,
  },
  themeRow: {
    flexDirection: 'row',
    borderRadius: Radius.xl,
    padding: 4,
    borderWidth: 1,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  themeOptionActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  themeOptionText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  listCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  listRowText: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
  listRowSubtext: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  listRowValue: {
    fontSize: FontSize.sm,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.lg,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  logoutText: {
    fontSize: FontSize.base,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  avatarPickerBtn: {
    position: 'relative',
  },
  avatarUploadOverlay: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  blockedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  blockedName: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  blockedUsername: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  unblockBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
