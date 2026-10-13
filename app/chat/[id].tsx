import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Keyboard,
  Animated,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { api } from '../../lib/api';
import {
  getSocket,
  emitTypingStart,
  emitTypingStop,
  emitJoinConversation,
  emitConversationViewing,
  emitConversationLeaveViewing,
} from '../../lib/socket';
import { resolveMediaUrl } from '../../lib/media';
import { Message, Conversation, MessageReaction } from '../../types/chat';
import { Avatar } from '../../components/Avatar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ─── Message Action Sheet ────────────────────────────────────────────────────
function MessageActionSheet({
  message,
  isMyMessage,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onReact,
  C,
}: {
  message: Message | null;
  isMyMessage: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  C: any;
}) {
  if (!message) return null;

  return (
    <Modal transparent animationType="fade" visible={!!message} onRequestClose={onClose}>
      <Pressable style={msgStyles.overlay} onPress={onClose}>
        <Pressable>
          <View style={[msgStyles.sheet, { backgroundColor: C.surface }]}>
            {/* Quick Reactions */}
            <View style={[msgStyles.emojiBar, { borderBottomColor: C.border }]}>
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity key={e} style={msgStyles.emojiBtn} onPress={() => onReact(e)}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View>
              {/* Reply */}
              <TouchableOpacity style={[msgStyles.row, { borderBottomColor: C.border }]} onPress={onReply}>
                <Ionicons name="arrow-undo-outline" size={20} color={C.primary} />
                <Text style={[msgStyles.label, { color: C.textPrimary }]}>Reply</Text>
              </TouchableOpacity>

              {/* Copy */}
              {message.content && (
                <TouchableOpacity style={[msgStyles.row, { borderBottomColor: C.border }]} onPress={onCopy}>
                  <Ionicons name="copy-outline" size={20} color={C.textSecondary} />
                  <Text style={[msgStyles.label, { color: C.textPrimary }]}>Copy Text</Text>
                </TouchableOpacity>
              )}

              {/* Edit (own text messages only) */}
              {isMyMessage && !message.isDeleted && message.type === 'TEXT' && (
                <TouchableOpacity style={[msgStyles.row, { borderBottomColor: C.border }]} onPress={onEdit}>
                  <Ionicons name="create-outline" size={20} color={C.textSecondary} />
                  <Text style={[msgStyles.label, { color: C.textPrimary }]}>Edit Message</Text>
                </TouchableOpacity>
              )}

              {/* Delete */}
              {isMyMessage && !message.isDeleted && (
                <TouchableOpacity style={[msgStyles.row, { borderBottomColor: C.border }]} onPress={onDelete}>
                  <Ionicons name="trash-outline" size={20} color={C.error} />
                  <Text style={[msgStyles.label, { color: C.error }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={[msgStyles.cancelBtn, { backgroundColor: C.backgroundTertiary }]}
              onPress={onClose}
            >
              <Text style={[msgStyles.cancelLabel, { color: C.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const msgStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, overflow: 'hidden' },
  emojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  emojiBtn: { padding: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    gap: 12,
  },
  label: { fontSize: FontSize.base },
  cancelBtn: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  cancelLabel: { fontSize: FontSize.base, fontWeight: '600' },
});

// ─── Main Chat Screen ────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const C = useThemeColors();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const {
    messages: allMessages,
    conversations,
    setMessages,
    addMessage,
    updateMessage,
    typingUsers,
    presence,
    setPresence,
    setActiveConversationId,
    markConversationReadLocally,
  } = useChatStore();

  const conversationId = id as string;
  const messages = allMessages[conversationId] || [];

  const initialConversation = conversations.find((c) => c.id === conversationId) ?? null;
  const [conversation, setConversation] = useState<Conversation | null>(initialConversation);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [pendingImage, setPendingImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pendingFile, setPendingFile] = useState<{ uri: string; name: string; mimeType: string; size: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimeoutRef = useRef<any>(null);

  // ── Scroll-position tracking ──────────────────────────────────────────────
  // For an inverted FlatList, offset 0 = bottom (newest messages).
  // "Near bottom" means the user hasn't scrolled more than NEAR_BOTTOM_THRESHOLD px up.
  const NEAR_BOTTOM_THRESHOLD = 120;
  const isNearBottomRef = useRef(true);   // tracks current scroll state without causing re-renders
  const [showNewMsgBtn, setShowNewMsgBtn] = useState(false);
  const newMsgBtnAnim = useRef(new Animated.Value(0)).current;
  const prevMessageCountRef = useRef(0);  // to detect incoming (non-own) new messages
  const isMountedRef = useRef(false);     // skip scroll-guard on first load

  // ── Helpers ──────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  const showNewMessageButton = useCallback(() => {
    setShowNewMsgBtn(true);
    Animated.spring(newMsgBtnAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
  }, [newMsgBtnAnim]);

  const hideNewMessageButton = useCallback(() => {
    Animated.timing(newMsgBtnAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowNewMsgBtn(false);
    });
  }, [newMsgBtnAnim]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom(true);
    hideNewMessageButton();
  }, [scrollToBottom, hideNewMessageButton]);

  // ── Keyboard listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        // Only scroll to bottom on keyboard show if the user is already near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 100);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    setActiveConversationId(conversationId);
    emitJoinConversation(conversationId);
    emitConversationViewing(conversationId);
    return () => {
      setActiveConversationId(null);
      emitConversationLeaveViewing(conversationId);
    };
  }, [conversationId]);


  // Show the conversation header immediately from the already-loaded Chats store.
  // The API response below then refreshes it with the latest server data.
  useEffect(() => {
    const cached = conversations.find((c) => c.id === conversationId);
    if (cached) {
      // Use the fully typed cached conversation immediately.
      // The server request below refreshes it with the latest data.
      setConversation(cached);
    }
  }, [conversationId, conversations]);

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      // Fetch both resources in parallel, but update the header as soon as
      // the conversation request completes instead of waiting for messages.
      const convPromise = api.get(`/conversations/${conversationId}`);
      const msgPromise = api.get(`/conversations/${conversationId}/messages`);

      const convRes = await convPromise;
      setConversation(convRes.data);

      const msgRes = await msgPromise;
      setMessages(conversationId, msgRes.data);
      // Seed the prev-count so the first-load doesn't trigger "new message" banner
      prevMessageCountRef.current = msgRes.data.length;

      if (convRes.data?.otherUser?.id) {
        const ou = convRes.data.otherUser;
        const current = presence[ou.id];
        setPresence(ou.id, current?.isOnline ?? ou.isOnline ?? false, current?.lastSeenAt ?? ou.lastSeenAt);
      }

      api.post(`/conversations/${conversationId}/read`).catch(() => {});
      markConversationReadLocally(conversationId);

      // Scroll to bottom (newest messages) once list has rendered
      setTimeout(() => {
        scrollToBottom(false);
        isMountedRef.current = true;
      }, 120);
    } catch (err: any) {
      console.warn('Failed to load chat:', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Re-fetch messages when the app comes back from background while this chat is open
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if ((prev === 'background' || prev === 'inactive') && nextState === 'active') {
        console.log('[AppState] Chat resumed from background — re-fetching messages');
        fetchMessages();
      }
    });
    return () => subscription.remove();
  }, [fetchMessages]);

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTypingStart(conversationId);
    typingTimeoutRef.current = setTimeout(() => { emitTypingStop(conversationId); }, 2000);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && !editingMessage) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTypingStop(conversationId);

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    if (editingMessage) {
      const socket = getSocket();
      if (socket) {
        socket.emit('message:edit', { messageId: editingMessage.id, content: text }, (res: any) => {
          if (res?.ok && res.message) updateMessage(res.message);
        });
      } else {
        const res = await api.patch(`/messages/${editingMessage.id}`, { content: text });
        updateMessage(res.data);
      }
      setEditingMessage(null);
      setInputText('');
      return;
    }

    const payload = {
      conversationId,
      type: 'TEXT',
      content: text,
      replyToId: replyingTo?.id || undefined,
    };

    setInputText('');
    setReplyingTo(null);

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('message:send', payload, (res: any) => {
        if (res?.ok && res.message) {
          addMessage(conversationId, res.message);
          // Always scroll to bottom when the current user sends a message
          setTimeout(() => scrollToBottom(true), 80);
        }
      });
    } else {
      const res = await api.post(`/conversations/${conversationId}/messages`, payload);
      addMessage(conversationId, res.data);
      // Always scroll to bottom when the current user sends a message
      setTimeout(() => scrollToBottom(true), 80);
    }

    // Optimistically scroll to bottom immediately (message will appear momentarily)
    setTimeout(() => scrollToBottom(true), 60);
  };

  // ── Image Picker: open preview modal (no forced crop) ─────────────────────
  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Need photo library access to send images'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    setPendingImage(result.assets[0]);
  };

  const handleSendPendingImage = async (asset: ImagePicker.ImagePickerAsset, editedFirst?: boolean) => {
    let finalAsset = asset;
    if (editedFirst) {
      // User wants to crop first — re-open picker with editing enabled
      const edited = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
      if (edited.canceled || !edited.assets[0]) return; // Stay on preview
      finalAsset = edited.assets[0];
    }
    setPendingImage(null);
    const uri = finalAsset.uri;
    const filename = uri.split('/').pop() || 'image.jpg';
    const mimeType = `image/${(/\.(\w+)$/.exec(filename)?.[1] || 'jpeg')}`;
    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: mimeType } as any);
    try {
      setIsUploading(true);
      // ── Upload diagnostics (no tokens/secrets logged) ──────────────────────
      const uploadPath = '/upload';
      console.log('[UPLOAD] PRE-REQUEST', {
        baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
        path: uploadPath,
        filename,
        mimeType,
        timeout: 60000,
      });
      const uploadRes = await api.post(uploadPath, formData, { timeout: 60000 });
      console.log('[UPLOAD] SUCCESS', {
        status: uploadRes.status,
        data: uploadRes.data,
      });
      // ──────────────────────────────────────────────────────────────────────
      const uploaded = uploadRes.data;
      const payload = {
        type: 'IMAGE',
        content: null,
        attachments: [{ type: 'IMAGE', fileName: uploaded.fileName, mimeType: uploaded.mimeType, size: uploaded.size, url: uploaded.url, width: finalAsset.width, height: finalAsset.height }],
      };
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('message:send', { conversationId, ...payload }, (res: any) => {
          if (res?.ok && res.message) {
            addMessage(conversationId, res.message);
            setTimeout(() => scrollToBottom(true), 80);
          }
        });
      } else {
        const res = await api.post(`/conversations/${conversationId}/messages`, payload);
        addMessage(conversationId, res.data);
        setTimeout(() => scrollToBottom(true), 80);
      }
      setTimeout(() => scrollToBottom(true), 60);
    } catch (err: any) {
      // ── Upload error diagnostics (no tokens/secrets logged) ───────────────
      console.log('[UPLOAD] ERROR', {
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        data: err?.response?.data,
        baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
        path: '/upload',
      });
      // ─────────────────────────────────────────────────────────────────────
      Alert.alert('Upload Error', err?.message || 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  // ── File Picker: open confirmation modal before sending ────────────────────
  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    setPendingFile({
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType || 'application/octet-stream',
      size: file.size || 0,
    });
  };

  const handleSendPendingFile = async () => {
    if (!pendingFile) return;
    const file = pendingFile; // Capture before clearing
    setPendingFile(null);
    const formData = new FormData();
    formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
    try {
      setIsUploading(true);
      // ── Upload diagnostics (no tokens/secrets logged) ──────────────────────
      const uploadPath = '/upload';
      console.log('[UPLOAD] PRE-REQUEST', {
        baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
        path: uploadPath,
        filename: file.name,
        mimeType: file.mimeType,
        timeout: 60000,
      });
      const uploadRes = await api.post(uploadPath, formData, { timeout: 60000 });
      console.log('[UPLOAD] SUCCESS', {
        status: uploadRes.status,
        data: uploadRes.data,
      });
      // ──────────────────────────────────────────────────────────────────────
      const uploaded = uploadRes.data;
      const payload = {
        type: 'FILE',
        content: file.name,
        attachments: [{ type: 'FILE', fileName: uploaded.fileName, mimeType: uploaded.mimeType, size: uploaded.size, url: uploaded.url }],
      };
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('message:send', { conversationId, ...payload }, (res: any) => {
          if (res?.ok && res.message) {
            addMessage(conversationId, res.message);
            setTimeout(() => scrollToBottom(true), 80);
          }
        });
      } else {
        const res = await api.post(`/conversations/${conversationId}/messages`, payload);
        addMessage(conversationId, res.data);
        setTimeout(() => scrollToBottom(true), 80);
      }
      setTimeout(() => scrollToBottom(true), 60);
    } catch (err: any) {
      // ── Upload error diagnostics (no tokens/secrets logged) ───────────────
      console.log('[UPLOAD] ERROR', {
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        data: err?.response?.data,
        baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
        path: '/upload',
      });
      // ─────────────────────────────────────────────────────────────────────
      Alert.alert('File Error', err?.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Open received file in system browser / app ─────────────────────────────
  const handleOpenFile = async (attachment: { url: string; fileName?: string }) => {
    const fileUrl = resolveMediaUrl(attachment.url);
    try {
      await Linking.openURL(fileUrl);
    } catch {
      try {
        const filename = attachment.fileName || fileUrl.split('/').pop() || 'file';
        const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
        const dest = dir ? `${dir}${dir.endsWith('/') ? '' : '/'}${filename}` : filename;
        const res = await FileSystem.downloadAsync(fileUrl, dest);
        await Linking.openURL(res.uri);
      } catch {
        Alert.alert('Cannot Open File', 'Could not open this file on your device.');
      }
    }
  };

  // ── Download / save received image ────────────────────────────────────────
  const handleSaveImage = async (url: string) => {
    const imageUrl = resolveMediaUrl(url);
    try {
      const filename = imageUrl.split('/').pop() || 'image.jpg';
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      const dest = dir ? `${dir}${dir.endsWith('/') ? '' : '/'}${filename}` : filename;
      await FileSystem.downloadAsync(imageUrl, dest);
      Alert.alert('Saved', 'Image saved to your device storage.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not save image.');
    }
  };

  const handleReact = (message: Message, emoji: string) => {
    setSelectedMessage(null);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('message:react', { messageId: message.id, emoji });
    } else {
      api.post(`/messages/${message.id}/reactions`, { emoji });
    }
  };

  const handleCopy = async (message: Message) => {
    setSelectedMessage(null);
    if (message.content) {
      await Clipboard.setStringAsync(message.content);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert('Copied', 'Message copied to clipboard');
    }
  };

  const handleDelete = (message: Message) => {
    setSelectedMessage(null);
    Alert.alert('Delete Message', 'How do you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete for Me',
        onPress: () => {
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('message:delete_for_me', { messageId: message.id });
          }
          updateMessage({ ...message, isDeleted: true, type: 'DELETED', content: 'This message was deleted' });
        },
      },
      {
        text: 'Delete for Everyone',
        style: 'destructive',
        onPress: () => {
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('message:delete', { messageId: message.id });
          } else {
            api.delete(`/messages/${message.id}`);
          }
        },
      },
    ]);
  };

  // ── Detect incoming realtime messages and show "New message" button ────────
  useEffect(() => {
    if (!isMountedRef.current) return; // Skip during initial load

    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (currentCount > prevCount) {
      const latestMessage = messages[messages.length - 1];
      const isOwnMessage = latestMessage?.senderId === user?.id;

      if (!isOwnMessage) {
        // Incoming message from someone else
        if (isNearBottomRef.current) {
          // User is already at the bottom — auto-scroll
          setTimeout(() => scrollToBottom(true), 60);
        } else {
          // User is reading older messages — show the button
          showNewMessageButton();
        }
      }
      // Own messages always scroll (handled in handleSend / upload handlers)
    }

    prevMessageCountRef.current = currentCount;
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll event handler ─────────────────────────────────────────────────
  const handleScroll = useCallback(
    (event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      // For an inverted FlatList, offset 0 = bottom.
      const nearBottom = offsetY <= NEAR_BOTTOM_THRESHOLD;

      if (nearBottom !== isNearBottomRef.current) {
        isNearBottomRef.current = nearBottom;

        // If user scrolled back to bottom, auto-hide the "new message" button
        if (nearBottom && showNewMsgBtn) {
          hideNewMessageButton();
        }
      }
    },
    [showNewMsgBtn, hideNewMessageButton]
  );

  const renderSubtitle = () => {
    const convTyping = typingUsers[conversationId] || {};
    const typingNames = Object.values(convTyping).filter((n) => n !== user?.displayName);

    if (typingNames.length > 0) {
      return (
        <Text style={[styles.headerSubtitle, { color: C.primary }]} numberOfLines={1}>
          {typingNames[0]} is typing...
        </Text>
      );
    }

    if (conversation?.type === 'DIRECT') {
      const otherId = conversation.otherUser?.id;
      const userPresence = otherId ? presence[otherId] : null;
      const isOnline = userPresence ? userPresence.isOnline : (conversation.otherUser?.isOnline ?? false);
      const lastSeenAt = userPresence?.lastSeenAt || conversation.otherUser?.lastSeenAt;

      if (isOnline) {
        return <Text style={[styles.headerSubtitle, { color: C.online }]}>Online</Text>;
      }

      let lastSeenText = 'Offline';
      if (lastSeenAt) {
        const d = new Date(lastSeenAt);
        const now = new Date();
        const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);
        if (diffMinutes < 1) lastSeenText = 'Last seen just now';
        else if (diffMinutes < 60) lastSeenText = `Last seen ${diffMinutes}m ago`;
        else if (d.toDateString() === now.toDateString()) lastSeenText = `Last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        else lastSeenText = `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
      }

      return <Text style={[styles.headerSubtitle, { color: C.textSecondary }]}>{lastSeenText}</Text>;
    }

    return (
      <Text style={[styles.headerSubtitle, { color: C.textSecondary }]}>
        {conversation?.members?.length || 0} members
      </Text>
    );
  };

  const formatMsgTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusTick = (status: string, isMine: boolean) => {
    if (!isMine) return null;
    if (status === 'READ') return <Text style={{ color: '#38bdf8', fontSize: 11 }}>✓✓</Text>;
    if (status === 'DELIVERED') return <Text style={{ color: C.textTertiary, fontSize: 11 }}>✓✓</Text>;
    if (status === 'SENT') return <Text style={{ color: C.textTertiary, fontSize: 11 }}>✓</Text>;
    return <Text style={{ color: C.textTertiary, fontSize: 11 }}>🕒</Text>;
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isMine = item.senderId === user?.id;
    const isSystem = item.type === 'SYSTEM';
    const isDeleted = item.isDeleted;
    const bubbleColor = isMine ? C.bubbleOut : C.bubbleIn;
    const bubbleTextColor = isMine ? C.bubbleOutText : C.bubbleInText;

    // Compute reaction totals
    const reactionCounts: Record<string, { count: number; reactedByMe: boolean }> = {};
    if (item.reactions) {
      for (const r of item.reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, reactedByMe: false };
        reactionCounts[r.emoji].count++;
        if (r.userId === user?.id) reactionCounts[r.emoji].reactedByMe = true;
      }
    }

    if (isSystem) {
      return (
        <View style={styles.systemRow}>
          <View style={[styles.systemPill, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.systemText, { color: C.textSecondary }]}>{item.content}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
        {/* Avatar for group chats */}
        {!isMine && conversation?.type === 'GROUP' && (
          <View style={{ marginRight: 6, alignSelf: 'flex-end', marginBottom: Object.keys(reactionCounts).length > 0 ? 28 : 4 }}>
            <Avatar
              avatarUrl={item.sender?.avatarUrl}
              displayName={item.sender?.displayName}
              size={28}
            />
          </View>
        )}

        <View style={{ maxWidth: SCREEN_WIDTH * 0.75 }}>
          {/* Sender name in groups */}
          {!isMine && conversation?.type === 'GROUP' && item.sender?.displayName && (
            <Text style={[styles.senderName, { color: C.primary }]}>{item.sender.displayName}</Text>
          )}

          {/* Message bubble */}
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              setSelectedMessage(item);
            }}
            delayLongPress={350}
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleColor,
                borderBottomRightRadius: isMine ? 4 : Radius.xl,
                borderBottomLeftRadius: isMine ? Radius.xl : 4,
              },
            ]}
          >
            {/* Reply Preview */}
            {item.replyTo && (
              <View style={[styles.replyPreview, { backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : C.inputBackground, borderLeftColor: isMine ? '#fff' : C.primary }]}>
                <Text style={[styles.replyAuthor, { color: isMine ? C.primaryText : C.primary }]} numberOfLines={1}>
                  {item.replyTo.sender?.displayName || 'User'}
                </Text>
                <Text style={[styles.replySnippet, { color: isMine ? C.primaryText + 'cc' : C.textSecondary }]} numberOfLines={1}>
                  {item.replyTo.isDeleted ? 'Message deleted' : item.replyTo.content || 'Attachment'}
                </Text>
              </View>
            )}

            {/* Image */}
            {item.type === 'IMAGE' && item.attachments?.[0] && (() => {
              const resolvedImgUrl = resolveMediaUrl(item.attachments[0].url);
              // ── Diagnostic (safe — no tokens/secrets) ──────────────────────
              console.log('[IMAGE RENDER]', { rawUrl: item.attachments[0].url, resolvedUrl: resolvedImgUrl });
              // ───────────────────────────────────────────────────────────────
              return (
                <TouchableOpacity onPress={() => setPreviewImageUrl(resolvedImgUrl)} activeOpacity={0.9}>
                  <Image
                    source={{ uri: resolvedImgUrl }}
                    style={styles.messageImage}
                    contentFit="cover"
                    transition={200}
                    onError={(e) => console.log('[IMAGE LOAD ERROR]', { url: resolvedImgUrl, error: (e as any)?.error ?? e })}
                  />
                </TouchableOpacity>
              );
            })()}

            {/* File — tappable to open/download */}
            {item.type === 'FILE' && item.attachments?.[0] && (
              <TouchableOpacity
                style={[styles.fileCard, { backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : C.inputBackground }]}
                onPress={() => handleOpenFile(item.attachments![0])}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 24, marginRight: 10 }}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: bubbleTextColor, fontWeight: '600', fontSize: FontSize.sm }} numberOfLines={1}>{item.attachments[0].fileName}</Text>
                  <Text style={{ color: bubbleTextColor + 'aa', fontSize: FontSize.xs }}>
                    {item.attachments[0].size > 1024 * 1024
                      ? (item.attachments[0].size / (1024 * 1024)).toFixed(2) + ' MB'
                      : (item.attachments[0].size / 1024).toFixed(1) + ' KB'}
                    {' · Tap to open'}
                  </Text>
                </View>
                <Ionicons name="download-outline" size={18} color={bubbleTextColor + 'bb'} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}

            {/* Text */}
            {item.content && (
              <Text style={[styles.messageText, { color: isDeleted ? (isMine ? C.primaryText + 'aa' : C.textTertiary) : bubbleTextColor, fontStyle: isDeleted ? 'italic' : 'normal' }]}>
                {item.content}
              </Text>
            )}

            {/* Meta */}
            <View style={styles.metaRow}>
              {item.isEdited && !isDeleted && (
                <Text style={[styles.metaText, { color: isMine ? C.primaryText + '99' : C.textTertiary }]}>edited </Text>
              )}
              <Text style={[styles.metaText, { color: isMine ? C.primaryText + '99' : C.textTertiary }]}>
                {formatMsgTime(item.createdAt)}
              </Text>
              {renderStatusTick(item.status, isMine)}
            </View>
          </TouchableOpacity>

          {/* Reactions */}
          {Object.keys(reactionCounts).length > 0 && (
            <View style={[styles.reactionsRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
              {Object.entries(reactionCounts).map(([emoji, { count, reactedByMe }]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionPill, { backgroundColor: reactedByMe ? C.primary + '25' : C.surface, borderColor: reactedByMe ? C.primary : C.border }]}
                  onPress={() => handleReact(item, emoji)}
                >
                  <Text style={{ fontSize: 14 }}>{emoji}</Text>
                  {count > 1 && (
                    <Text style={[styles.reactionCount, { color: reactedByMe ? C.primary : C.textSecondary }]}>{count}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  const typingUserNames = Object.values(typingUsers[conversationId] || {}).filter((n) => n !== user?.displayName);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: C.background }]}
      enabled
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerTitleContainer}
          activeOpacity={0.8}
          onPress={() => {
            if (conversation?.type === 'DIRECT' && conversation.otherUser?.id) {
              router.push(`/profile/${conversation.otherUser.id}` as any);
            } else if (conversation?.type === 'GROUP') {
              router.push(`/group/${conversation.id}` as any);
            }
          }}
        >
          <Avatar
            avatarUrl={conversation?.avatarUrl}
            displayName={conversation?.name}
            username={conversation?.otherUser?.username}
            size={38}
            showOnlineIndicator={conversation?.type === 'DIRECT'}
            isOnline={conversation?.otherUser?.id ? (presence[conversation.otherUser.id]?.isOnline ?? conversation.otherUser.isOnline ?? false) : false}
            badgeBorderColor={C.surface}
          />
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={[styles.headerTitle, { color: C.textPrimary }]} numberOfLines={1}>
              {conversation?.name || 'Chat'}
            </Text>
            {renderSubtitle()}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerAction} onPress={() => setShowHeaderMenu(true)}>
          <Ionicons name="ellipsis-vertical" size={20} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Header menu modal ───────────────────────────────────────────── */}
      <Modal
        visible={showHeaderMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHeaderMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowHeaderMenu(false)}>
          <Pressable>
            <View style={[styles.menuSheet, { backgroundColor: C.surface }]}>
              <TouchableOpacity
                style={[styles.menuRow, { borderBottomColor: C.border }]}
                onPress={() => {
                  setShowHeaderMenu(false);
                  router.push(`/chat/gallery?id=${conversationId}&name=${encodeURIComponent(conversation?.name || '')}` as any);
                }}
              >
                <Ionicons name="images-outline" size={20} color={C.primary} style={{ marginRight: Spacing.md }} />
                <Text style={[styles.menuLabel, { color: C.textPrimary }]}>Media, Files & Links</Text>
                <Ionicons name="chevron-forward" size={16} color={C.textTertiary} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Message List */}
      {isLoading && messages.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <View style={styles.flex}>
          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            renderItem={renderMessageItem}
            inverted
            contentContainerStyle={[styles.messageListContent, { paddingBottom: Spacing.lg }]}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScroll={handleScroll}
            scrollEventThrottle={80}
          />

          {/* ── "↓ New message" floating button ─────────────────────────── */}
          {showNewMsgBtn && (
            <Animated.View
              style={[
                styles.newMsgBtn,
                {
                  backgroundColor: C.primary,
                  opacity: newMsgBtnAnim,
                  transform: [{
                    translateY: newMsgBtnAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  }],
                },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={styles.newMsgBtnInner}
                onPress={handleScrollToBottom}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-down" size={14} color="#fff" />
                <Text style={styles.newMsgBtnText}>New message</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      )}

      {/* Typing Indicator */}
      {typingUserNames.length > 0 && (
        <View style={[styles.typingBar, { backgroundColor: C.surface }]}>
          <Text style={[styles.typingText, { color: C.primary }]}>
            {typingUserNames[0]} is typing...
          </Text>
        </View>
      )}

      {/* Reply Banner */}
      {replyingTo && (
        <View style={[styles.banner, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <View style={[styles.bannerBar, { backgroundColor: C.primary }]} />
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={[styles.bannerTitle, { color: C.primary }]}>
              Replying to {replyingTo.sender?.displayName || 'User'}
            </Text>
            <Text style={[styles.bannerSnippet, { color: C.textSecondary }]} numberOfLines={1}>
              {replyingTo.content || 'Attachment'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.bannerClose}>
            <Ionicons name="close" size={18} color={C.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Banner */}
      {editingMessage && (
        <View style={[styles.banner, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <View style={[styles.bannerBar, { backgroundColor: C.primaryDark }]} />
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={[styles.bannerTitle, { color: C.primaryDark }]}>Editing message</Text>
            <Text style={[styles.bannerSnippet, { color: C.textSecondary }]} numberOfLines={1}>
              {editingMessage.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { setEditingMessage(null); setInputText(''); }}
            style={styles.bannerClose}
          >
            <Ionicons name="close" size={18} color={C.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: C.surface,
            borderTopColor: C.border,
            paddingBottom: isKeyboardVisible
              ? Spacing.xs
              : Math.max(insets.bottom, Spacing.sm),
          },
        ]}
      >
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={22} color={C.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickDocument}>
          <Ionicons name="attach-outline" size={22} color={C.textSecondary} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: C.inputBackground,
              color: C.inputText,
              borderColor: C.inputBorder,
              maxHeight: 100,
            },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={C.inputPlaceholder}
          value={inputText}
          onChangeText={handleInputChange}
          multiline
          returnKeyType="default"
        />

        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: (inputText.trim() || editingMessage) ? C.primary : C.primary + '50' },
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() && !editingMessage}
          activeOpacity={0.8}
        >
          <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Message Long-Press Action Sheet */}
      <MessageActionSheet
        message={selectedMessage}
        isMyMessage={selectedMessage?.senderId === user?.id}
        onClose={() => setSelectedMessage(null)}
        onReply={() => {
          if (selectedMessage) setReplyingTo(selectedMessage);
          setSelectedMessage(null);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        onCopy={() => selectedMessage && handleCopy(selectedMessage)}
        onEdit={() => {
          if (selectedMessage) {
            setEditingMessage(selectedMessage);
            setInputText(selectedMessage.content || '');
          }
          setSelectedMessage(null);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        onDelete={() => selectedMessage && handleDelete(selectedMessage)}
        onReact={(emoji) => selectedMessage && handleReact(selectedMessage, emoji)}
        C={C}
      />

      {/* Image Lightbox */}
      <Modal visible={!!previewImageUrl} transparent animationType="fade" onRequestClose={() => setPreviewImageUrl(null)}>
        <View style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setPreviewImageUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.lightboxSave} onPress={() => previewImageUrl && handleSaveImage(previewImageUrl)}>
            <Ionicons name="download-outline" size={24} color="#fff" />
          </TouchableOpacity>
          {previewImageUrl && (
            <Image source={{ uri: resolveMediaUrl(previewImageUrl) }} style={styles.lightboxImage} contentFit="contain" />
          )}
        </View>
      </Modal>

      {/* Upload progress indicator */}
      {isUploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {/* ── Image Preview Modal ─────────────────────────────────────────────── */}
      {pendingImage && (
        <Modal visible transparent animationType="slide" onRequestClose={() => !isUploading && setPendingImage(null)}>
          <View style={styles.previewOverlay}>
            {/* Header bar */}
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.previewBtn} disabled={isUploading}>
                <Ionicons name="close" size={22} color="#fff" />
                <Text style={styles.previewBtnText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.previewTitle}>Send Image</Text>
              <TouchableOpacity
                onPress={() => handleSendPendingImage(pendingImage)}
                style={[styles.previewBtn, styles.previewSendBtn]}
                disabled={isUploading}
              >
                {isUploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="send" size={17} color="#fff" /><Text style={styles.previewBtnText}>Send</Text></>
                }
              </TouchableOpacity>
            </View>

            {/* Full-screen image preview */}
            <Image source={{ uri: pendingImage.uri }} style={styles.previewImage} contentFit="contain" />

            {/* Optional crop button */}
            <TouchableOpacity
              onPress={() => handleSendPendingImage(pendingImage, true)}
              style={styles.editCropBtn}
              disabled={isUploading}
            >
              <Ionicons name="crop" size={17} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '500' }}>Crop / Edit first</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* ── File Preview / Confirmation Modal ──────────────────────────────── */}
      {pendingFile && (
        <Modal visible transparent animationType="slide" onRequestClose={() => !isUploading && setPendingFile(null)}>
          <View style={styles.filePreviewOverlay}>
            <View style={[styles.filePreviewSheet, { backgroundColor: C.surface }]}>
              <Text style={[styles.filePreviewTitle, { color: C.textPrimary }]}>Send File?</Text>

              {/* File info card */}
              <View style={[styles.filePreviewCard, { backgroundColor: C.inputBackground, borderColor: C.border, borderWidth: 1 }]}>
                <Ionicons name="document-text-outline" size={44} color={C.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: C.textPrimary, fontWeight: '700', fontSize: FontSize.base, lineHeight: 20 }} numberOfLines={3}>
                    {pendingFile.name}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.xs, marginTop: 4 }}>
                    {pendingFile.mimeType}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: FontSize.sm, marginTop: 2, fontWeight: '600' }}>
                    {pendingFile.size > 1024 * 1024
                      ? (pendingFile.size / (1024 * 1024)).toFixed(2) + ' MB'
                      : (pendingFile.size / 1024).toFixed(1) + ' KB'}
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.filePreviewActions}>
                <TouchableOpacity
                  onPress={() => setPendingFile(null)}
                  style={[styles.filePreviewActionBtn, { backgroundColor: C.backgroundTertiary }]}
                  disabled={isUploading}
                >
                  <Text style={{ color: C.textSecondary, fontWeight: '600', fontSize: FontSize.base }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendPendingFile}
                  style={[styles.filePreviewActionBtn, { backgroundColor: C.primary }]}
                  disabled={isUploading}
                >
                  {isUploading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.base }}>Send</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: { padding: Spacing.sm },
  headerTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: FontSize.base, fontWeight: '700' },
  headerSubtitle: { fontSize: FontSize.xs, fontWeight: '500', marginTop: 1 },
  headerAction: { padding: Spacing.sm },
  messageListContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 3,
    paddingHorizontal: 0,
  },
  senderName: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 3, marginLeft: 2 },
  bubble: {
    borderRadius: Radius.xl,
    padding: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  replyPreview: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 6,
    borderRadius: 4,
  },
  replyAuthor: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
  replySnippet: { fontSize: FontSize.xs },
  messageImage: { width: 220, height: 180, borderRadius: 10 },
  fileCard: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8 },
  messageText: { fontSize: FontSize.base, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 },
  metaText: { fontSize: 10 },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  reactionCount: { fontSize: 12, fontWeight: '700' },
  systemRow: { alignItems: 'center', marginVertical: 8 },
  systemPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
  },
  systemText: { fontSize: FontSize.xs },
  typingBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
  },
  typingText: { fontSize: FontSize.xs, fontStyle: 'italic', fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
  },
  bannerBar: { width: 3, height: '80%', borderRadius: 2 },
  bannerTitle: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
  bannerSnippet: { fontSize: FontSize.xs },
  bannerClose: { padding: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: 1,
    gap: 6,
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: FontSize.base,
    lineHeight: 20,
    minHeight: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  lightboxImage: { width: '100%', height: '80%' },
  lightboxSave: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    padding: 10,
  },
  // Upload progress bar (absolute, floats above input)
  uploadingBar: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(99,102,241,0.92)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 8,
  },
  uploadingText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  // Image preview modal
  previewOverlay: { flex: 1, backgroundColor: '#000' },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 52,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  previewTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 20,
  },
  previewSendBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
  },
  previewBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewImage: { flex: 1, width: '100%' },
  editCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 28,
    marginBottom: 40,
  },
  // File preview / confirmation modal
  filePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  filePreviewSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 48,
  },
  filePreviewTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 22,
    textAlign: 'center',
  },
  filePreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 28,
  },
  filePreviewActions: { flexDirection: 'row', gap: 12 },
  filePreviewActionBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── "New message" floating button ─────────────────────────────────────────
  newMsgBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 100,
  },
  newMsgBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  newMsgBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // ── Header ⋮ menu ──────────────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: 8,
  },
  menuSheet: {
    borderRadius: 14,
    minWidth: 230,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});

