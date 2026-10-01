import { Tabs, Redirect } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize } from '../../constants/Typography';
import { useChatStore } from '../../store/chatStore';

function TabBarIcon({ name, focused, color }: { name: any; focused: boolean; color: string }) {
  return <Ionicons name={name} size={22} color={color} />;
}

export default function TabsLayout() {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { conversations } = useChatStore();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Unread counts for badges
  const totalChatUnread = conversations
    .filter((c) => c.type === 'DIRECT')
    .reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const totalGroupUnread = conversations
    .filter((c) => c.type === 'GROUP')
    .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.tabBar,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 54 + (insets.bottom > 0 ? insets.bottom : 8),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} color={color} />
          ),
          tabBarBadge: totalChatUnread > 0 ? (totalChatUnread > 99 ? '99+' : totalChatUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '700' },
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'people' : 'people-outline'} focused={focused} color={color} />
          ),
          tabBarBadge: totalGroupUnread > 0 ? (totalGroupUnread > 99 ? '99+' : totalGroupUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '700' },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
