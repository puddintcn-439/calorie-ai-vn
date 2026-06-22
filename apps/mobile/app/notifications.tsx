import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text as NativeText, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '../components/i18n-text';
import { createThemedStyles, useAppTheme } from '../components/theme';
import { useI18n } from '../components/i18n';
import { notificationsService, type UserNotification } from '../services/notifications.service';

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) return '--';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString(locale);
  }, [locale]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await notificationsService.fetchNotifications();
      setNotifications(response.notifications ?? []);
    } catch {
      setError('notifications.error.load');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const markRead = async (notification: UserNotification) => {
    if (notification.read_at) return;
    // Optimistic update — revert on failure
    const optimisticTs = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => item.id === notification.id ? { ...item, read_at: optimisticTs } : item),
    );
    try {
      const updated = await notificationsService.markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read_at: updated.read_at } : item),
      );
    } catch {
      // Revert optimistic update
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read_at: null } : item),
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow} i18nKey="notifications.eyebrow" />
          <Text style={styles.title} i18nKey="notifications.title" />
          <Text style={styles.subtitle} i18nKey="notifications.subtitle" />
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.refresh')}
        >
          <Text style={styles.refreshText} i18nKey="notifications.refresh" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerCard}>
          <ActivityIndicator color={colors.accentMint} />
          <Text style={styles.mutedText} i18nKey="notifications.loading" />
        </View>
      ) : error ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorText} i18nKey={error as any} />
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.retryText} i18nKey="common.retry" />
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerCard}>
          <Text style={styles.mutedText} i18nKey="notifications.empty" />
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
                accessibilityRole="button"
              >
                <View style={styles.notificationHeader}>
                  {/* Dynamic server strings — bypass i18n pipeline */}
                  <NativeText style={styles.notificationTitle}>{notification.title}</NativeText>
                  {unread ? <View style={styles.unreadDot} /> : null}
                </View>
                <NativeText style={styles.notificationBody}>{notification.body}</NativeText>
                <NativeText style={styles.notificationMeta}>{formatDate(notification.created_at)}</NativeText>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = createThemedStyles((colors, _radii, spacing) => ({
  container: { flex: 1, backgroundColor: colors.bgBottom },
  content: { padding: spacing.md, gap: spacing.md },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 5 },
  eyebrow: { color: colors.accentCyan, fontSize: 12, fontWeight: '900' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  refreshButton: { borderRadius: 14, backgroundColor: colors.accentMint, paddingHorizontal: 14, paddingVertical: 10 },
  refreshText: { color: colors.textOnAccent, fontWeight: '900' },
  centerCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 18, alignItems: 'center', gap: 10 },
  list: { gap: 12 },
  notificationCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 8 },
  notificationCardUnread: { borderColor: colors.accentMint, backgroundColor: colors.surfaceSuccess },
  notificationHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  notificationTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentMint },
  notificationBody: { color: colors.textSoft, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  notificationMeta: { color: colors.textMuted, fontSize: 12 },
  mutedText: { color: colors.textMuted, textAlign: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', fontWeight: '800' },
  retryButton: { borderRadius: 12, backgroundColor: colors.accentMint, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: colors.textOnAccent, fontWeight: '900', fontSize: 14 },
}));
