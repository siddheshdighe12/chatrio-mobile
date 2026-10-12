import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { UserSummary } from '../../types/chat';
import { Avatar } from '../../components/Avatar';

const REPORT_REASONS = [
  'Spam or advertising',
  'Harassment or bullying',
  'Inappropriate content',
  'Fake account or impersonation',
  'Other',
];

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const C = useThemeColors();

  const { user, updateUser } = useAuthStore();
  const { addOrUpdateConversation, presence } = useChatStore();

  const [profile, setProfile] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  // Edit own profile modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Report modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [reportNote, setReportNote] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const isMe = user?.id === id;

  const fetchProfileAndStatus = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [profileRes, blockedRes] = await Promise.all([
        api.get(`/users/${id}`),
        !isMe ? api.get('/users/blocked').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setProfile(profileRes.data);
      if (blockedRes.data && Array.isArray(blockedRes.data)) {
        setIsBlocked(blockedRes.data.some((b: any) => b.id === id));
      }
    } catch (err: any) {
      console.warn('Failed to load profile:', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [id, isMe]);

  useEffect(() => {
    fetchProfileAndStatus();
  }, [fetchProfileAndStatus]);

  const handleStartChat = async () => {
    if (!profile) return;
    setIsStartingChat(true);
    try {
      const res = await api.post('/conversations/direct', { targetUserId: profile.id });
      const conv = res.data;
      addOrUpdateConversation(conv);
      router.push(`/chat/${conv.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to start chat');
    } finally {
      setIsStartingChat(false);
    }
  };

  const handleToggleBlock = () => {
    if (!profile) return;

    if (isBlocked) {
      Alert.alert('Unblock User', `Are you sure you want to unblock ${profile.displayName}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await api.delete(`/users/${profile.id}/block`);
              setIsBlocked(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              Alert.alert('Error', 'Failed to unblock user');
            }
          },
        },
      ]);
    } else {
      Alert.alert(
        'Block User',
        `Are you sure you want to block ${profile.displayName}? They won't be able to message you.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.post(`/users/${profile.id}/block`);
                setIsBlocked(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (err: any) {
                Alert.alert('Error', 'Failed to block user');
              }
            },
          },
        ]
      );
    }
  };

  const handleSendReport = async () => {
    if (!profile) return;
    setIsSubmittingReport(true);
    try {
      const fullReason = reportNote.trim() ? `${selectedReason}: ${reportNote.trim()}` : selectedReason;
      await api.post(`/users/${profile.id}/report`, {
        reason: fullReason,
        targetType: 'USER',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsReportModalOpen(false);
      Alert.alert('Report Submitted', 'Thank you for reporting. Our moderation team will review this user.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo library access to change photo.');
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

    setIsUploadingPhoto(true);
    try {
      const res = await api.post('/users/avatar', formData);
      updateUser({ avatarUrl: res.data.avatarUrl });
      setProfile((prev) => (prev ? { ...prev, avatarUrl: res.data.avatarUrl } : null));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.error || err.message || 'Could not upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveOwnProfile = async () => {
    if (!editDisplayName.trim()) {
      Alert.alert('Required', 'Display name cannot be empty');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await api.patch('/users/profile', {
        displayName: editDisplayName.trim(),
        bio: editBio.trim() || null,
      });

      updateUser({
        displayName: res.data.displayName,
        bio: res.data.bio,
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              displayName: res.data.displayName,
              bio: res.data.bio,
            }
          : null
      );
      setIsEditModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const isOnline = id ? presence[id]?.isOnline ?? profile?.isOnline ?? false : false;
  const lastSeenAt = id ? presence[id]?.lastSeenAt ?? profile?.lastSeenAt : profile?.lastSeenAt;

  let lastSeenText = 'Offline';
  if (lastSeenAt) {
    const d = new Date(lastSeenAt);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMinutes < 1) {
      lastSeenText = 'Last seen just now';
    } else if (diffMinutes < 60) {
      lastSeenText = `Last seen ${diffMinutes}m ago`;
    } else if (d.toDateString() === now.toDateString()) {
      lastSeenText = `Last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      lastSeenText = `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>
          {isMe ? 'My Profile' : 'Profile'}
        </Text>
        {isMe ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              setEditDisplayName(profile?.displayName || '');
              setEditBio(profile?.bio || '');
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
      ) : profile ? (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing['4xl'] }}>
          {/* Avatar and Identity */}
          <View style={[styles.profileCard, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (profile.avatarUrl) {
                  setPreviewAvatar(profile.avatarUrl);
                } else if (isMe) {
                  handlePickPhoto();
                }
              }}
              style={styles.avatarWrapper}
            >
              <Avatar
                avatarUrl={profile.avatarUrl}
                displayName={profile.displayName}
                username={profile.username}
                size={100}
                showOnlineIndicator={!isMe}
                isOnline={isOnline}
                badgeBorderColor={C.surface}
              />
              {isMe && (
                <TouchableOpacity
                  style={[styles.cameraBadge, { backgroundColor: C.primary }]}
                  onPress={handlePickPhoto}
                  disabled={isUploadingPhoto}
                >
                  {isUploadingPhoto ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <Text style={[styles.displayName, { color: C.textPrimary }]}>{profile.displayName}</Text>
            <Text style={[styles.username, { color: C.textSecondary }]}>@{profile.username}</Text>

            {!isMe && (
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? C.online : C.textTertiary },
                  ]}
                />
                <Text style={[styles.statusText, { color: isOnline ? C.online : C.textTertiary }]}>
                  {isOnline ? 'Online now' : lastSeenText}
                </Text>
              </View>
            )}

            {profile.bio ? (
              <View style={[styles.bioCard, { backgroundColor: C.backgroundSecondary, borderColor: C.border }]}>
                <Text style={[styles.bioLabel, { color: C.textTertiary }]}>ABOUT</Text>
                <Text style={[styles.bioContent, { color: C.textPrimary }]}>{profile.bio}</Text>
              </View>
            ) : null}

            {/* Action button: Send Message (for others) */}
            {!isMe && (
              <TouchableOpacity
                style={[styles.messageBtn, { backgroundColor: C.primary }]}
                activeOpacity={0.85}
                onPress={handleStartChat}
                disabled={isStartingChat}
              >
                {isStartingChat ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="chatbubble" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.messageBtnText}>Message</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Privacy & Moderation for other users */}
          {!isMe && (
            <View style={[styles.actionSection, { backgroundColor: C.surface, borderTopColor: C.border, borderBottomColor: C.border }]}>
              {/* Block / Unblock */}
              <TouchableOpacity style={styles.actionRow} onPress={handleToggleBlock}>
                <Ionicons
                  name={isBlocked ? 'shield-checkmark-outline' : 'ban-outline'}
                  size={22}
                  color={isBlocked ? C.primary : C.error}
                />
                <Text
                  style={[
                    styles.actionRowText,
                    { color: isBlocked ? C.primary : C.error },
                  ]}
                >
                  {isBlocked ? 'Unblock User' : 'Block User'}
                </Text>
              </TouchableOpacity>

              {/* Report */}
              <TouchableOpacity
                style={[styles.actionRow, { borderTopWidth: 1, borderTopColor: C.border }]}
                onPress={() => setIsReportModalOpen(true)}
              >
                <Ionicons name="flag-outline" size={22} color={C.error} />
                <Text style={[styles.actionRowText, { color: C.error }]}>Report User</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={{ color: C.textSecondary }}>User not found</Text>
        </View>
      )}

      {/* Edit Profile Modal (for current user) */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent onRequestClose={() => setIsEditModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsEditModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.textPrimary }]}>Edit Profile</Text>

            <Text style={[styles.inputLabel, { color: C.textSecondary }]}>Display Name</Text>
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: C.inputBackground, color: C.inputText, borderColor: C.inputBorder },
              ]}
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              placeholder="Your name"
              placeholderTextColor={C.inputPlaceholder}
            />

            <Text style={[styles.inputLabel, { color: C.textSecondary, marginTop: Spacing.md }]}>Bio</Text>
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
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell others about yourself..."
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
                onPress={handleSaveOwnProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report User Modal */}
      <Modal visible={isReportModalOpen} animationType="slide" transparent onRequestClose={() => setIsReportModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsReportModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.textPrimary }]}>Report User</Text>
            <Text style={[styles.inputLabel, { color: C.textSecondary }]}>Select a reason</Text>

            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={styles.reasonOption}
                onPress={() => setSelectedReason(r)}
              >
                <Ionicons
                  name={selectedReason === r ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedReason === r ? C.primary : C.textTertiary}
                />
                <Text style={[styles.reasonText, { color: C.textPrimary }]}>{r}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.inputLabel, { color: C.textSecondary, marginTop: Spacing.md }]}>
              Additional details (optional)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: C.inputBackground,
                  color: C.inputText,
                  borderColor: C.inputBorder,
                  height: 60,
                  textAlignVertical: 'top',
                },
              ]}
              value={reportNote}
              onChangeText={setReportNote}
              placeholder="Describe what happened..."
              placeholderTextColor={C.inputPlaceholder}
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.backgroundTertiary }]}
                onPress={() => setIsReportModalOpen(false)}
              >
                <Text style={[styles.modalBtnText, { color: C.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.error }]}
                onPress={handleSendReport}
                disabled={isSubmittingReport}
              >
                {isSubmittingReport ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
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
    </SafeAreaView>
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
  avatarWrapper: {
    position: 'relative',
    marginVertical: Spacing.md,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  displayName: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  username: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  bioCard: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  bioLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bioContent: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    marginTop: Spacing.xl,
  },
  messageBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  actionSection: {
    marginTop: Spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  actionRowText: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  reasonText: {
    fontSize: FontSize.base,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.xl,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
  },
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
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
