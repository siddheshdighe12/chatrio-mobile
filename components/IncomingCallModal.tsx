import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallStore } from '../store/callStore';

const { width } = Dimensions.get('window');

export function IncomingCallModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    stage,
    otherUser,
    callType,
    callId,
    isGroupCall,
    groupName,
    acceptCall,
    declineCall,
  } = useCallStore();

  const isVisible = stage === 'INCOMING_RINGING' || stage === 'CONNECTING';

  if (!isVisible || !otherUser) return null;

  const handleAccept = async () => {
    const ok = await acceptCall();
    if (ok && callId) {
      router.push(`/call/${callId}` as any);
    }
  };

  const handleDecline = async () => {
    await declineCall();
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        {/* Background dark overlay */}
        <View style={styles.content}>
          {/* Call Type Tag */}
          <View style={styles.badge}>
            <Ionicons
              name={callType === 'VIDEO' ? 'videocam' : 'call'}
              size={16}
              color="#A5B4FC"
            />
            <Text style={styles.badgeText}>
              {isGroupCall ? 'Group ' : ''}Incoming {callType === 'VIDEO' ? 'Video' : 'Audio'} Call
            </Text>
          </View>

          {/* Caller Avatar */}
          <View style={styles.avatarWrapper}>
            {otherUser.avatarUrl ? (
              <Image source={{ uri: otherUser.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar]}>
                <Text style={styles.avatarInitial}>
                  {(isGroupCall ? groupName : otherUser.displayName)?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>

          {/* Caller Details */}
          <Text style={styles.callerName}>
            {isGroupCall ? groupName : otherUser.displayName}
          </Text>
          {isGroupCall && otherUser.displayName && (
            <Text style={styles.initiatorText}>
              Started by {otherUser.displayName}
            </Text>
          )}
          <Text style={styles.statusText}>
            {stage === 'CONNECTING' ? 'Connecting...' : 'Ringing...'}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {/* Decline Button */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                onPress={handleDecline}
                style={[styles.actionBtn, styles.declineBtn]}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={32} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Decline</Text>
            </View>

            {/* Accept Button */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                onPress={handleAccept}
                style={[styles.actionBtn, styles.acceptBtn]}
                activeOpacity={0.8}
                disabled={stage === 'CONNECTING'}
              >
                <Ionicons
                  name={callType === 'VIDEO' ? 'videocam' : 'call'}
                  size={30}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: width - 48,
    alignItems: 'center',
    paddingVertical: 32,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 40,
  },
  badgeText: {
    color: '#E0E7FF',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
    marginBottom: 24,
  },
  avatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  placeholderAvatar: {
    backgroundColor: '#312E81',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#EEF2FF',
    fontSize: 48,
    fontWeight: '700',
  },
  callerName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  initiatorText: {
    fontSize: 15,
    color: '#CBD5E1',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 60,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 24,
  },
  actionItem: {
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  declineBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  actionLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '500',
  },
});
