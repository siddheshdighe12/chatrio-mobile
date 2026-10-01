import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { resolveMediaUrl } from '../lib/media';

interface AvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
  size?: number;
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
  badgeBorderColor?: string;
}

const INITIALS_COLORS = [
  '#6366F1','#8B5CF6','#EC4899','#EF4444','#F59E0B',
  '#10B981','#06B6D4','#3B82F6','#14B8A6','#F97316',
  '#84CC16','#A855F7',
];

function pickColor(name: string): string {
  if (!name) return INITIALS_COLORS[0];
  const charCode = name.charCodeAt(0);
  return INITIALS_COLORS[charCode % INITIALS_COLORS.length];
}

function getInitials(displayName?: string | null, username?: string | null): string {
  const source = (displayName || username || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.substring(0, 2).toUpperCase();
}

export function Avatar({
  avatarUrl,
  displayName,
  username,
  size = 48,
  showOnlineIndicator = false,
  isOnline = false,
  badgeBorderColor = '#fff',
}: AvatarProps) {
  const initials = getInitials(displayName, username);
  const bgColor = pickColor(displayName || username || '?');
  const fontSize = size * 0.38;
  const badgeSize = size * 0.28;
  const badgeOffset = size * -0.04;

  const isRealPhoto = avatarUrl && !avatarUrl.includes('dicebear.com');
  const resolvedUrl = isRealPhoto ? resolveMediaUrl(avatarUrl) : '';

  return (
    <View style={{ width: size, height: size }}>
      {isRealPhoto ? (
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={[
            styles.initialsCircle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bgColor,
            },
          ]}
        >
          <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
        </View>
      )}

      {showOnlineIndicator && isOnline && (
        <View
          style={[
            styles.badge,
            {
              width: Math.max(12, Math.round(size * 0.25)),
              height: Math.max(12, Math.round(size * 0.25)),
              borderRadius: Math.round(size * 0.25) / 2,
              bottom: 0,
              right: 0,
              backgroundColor: '#22C55E',
              borderColor: badgeBorderColor,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  initialsCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    borderWidth: 2,
  },
});
