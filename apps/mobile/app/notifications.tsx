import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '../components/i18n-text';
import { theme } from '../components/theme';
import { notificationsService, type UserNotification } from '../services/notifications.service';

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await notificationsService.fetchNotifications();
      setNotifications(response.notifications ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Không thể tải thông báo.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const markRead = async (notification: UserNotification) => {
    if (notification.read_at) return;
    try {
      const updated = await notificationsService.markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: updated.read_at } : item));
    } catch {
      // Keep the list readable even if the read receipt fails.
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>THÔNG BÁO</Text>
          <Text style={styles.title}>Cập nhật hỗ trợ</Text>
          <Text style={styles.subtitle}>Theo dõi trạng thái yêu cầu thanh toán và các cập nhật trong app.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void load()}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.mutedText}>Đang tải thông báo...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerCard}>
          <Text style={styles.mutedText}>Chưa có thông báo.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => {
            const unread = !notification.read_at;
            return (
              <TouchableOpacity
                key={notification.id}
                style={[styles.notificationCard, unread && styles.notificationCardUnread]}
                onPress={() => void markRead(notification)}
              >
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  {unread ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.notificationBody}>{notification.body}</Text>
                <Text style={styles.notificationMeta}>{formatDate(notification.created_at)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgBottom },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  backButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 5 },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900' },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  refreshButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  centerCard: { borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 18, alignItems: 'center', gap: 10 },
  list: { gap: 12 },
  notificationCard: { borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 14, gap: 8 },
  notificationCardUnread: { borderColor: theme.colors.accentMint, backgroundColor: theme.colors.surfaceSuccess },
  notificationHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  notificationTitle: { flex: 1, color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accentMint },
  notificationBody: { color: theme.colors.textSoft, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  notificationMeta: { color: theme.colors.textMuted, fontSize: 12 },
  mutedText: { color: theme.colors.textMuted, textAlign: 'center' },
  errorText: { color: theme.colors.danger, textAlign: 'center', fontWeight: '800' },
});
