import React, { useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../components/ui-shell';
import { UiButton } from '../components/ui-button';
import { Text } from '../components/i18n-text';
import { useI18n } from '../components/i18n';
import { createThemedStyles, useAppTheme } from '../components/theme';
import { useNotificationStore } from '../store/notification.store';
import { UserNotification } from '../services/notifications.service';

function notificationIcon(type: string): React.ComponentProps<typeof MaterialIcons>['name'] {
  if (type.includes('billing') || type.includes('payment')) return 'payments';
  if (type.includes('support')) return 'forum';
  if (type.includes('reminder')) return 'restaurant';
  if (type.includes('subscription')) return 'workspace-premium';
  return 'notifications';
}

function relativeDate(value: string | null, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return locale === 'vi' ? 'Vừa xong' : 'Just now';
  if (diffMinutes < 60) return locale === 'vi' ? `${diffMinutes} phút` : `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return locale === 'vi' ? `${hours} giờ` : `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale === 'vi' ? `${days} ngày` : `${days}d`;
  return date.toLocaleDateString(locale);
}

export default function NotificationsScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const loading = useNotificationStore((state) => state.loading);
  const refresh = useNotificationStore((state) => state.refresh);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    refresh().catch(() => setError(true));
  }, [refresh]);

  const visible = useMemo(
    () => filter === 'unread' ? notifications.filter((item) => !item.read_at) : notifications,
    [filter, notifications],
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  const openNotification = async (notification: UserNotification) => {
    if (!notification.read_at) await markRead(notification.id).catch(() => {});
    const route = typeof notification.metadata?.route === 'string'
      ? notification.metadata.route
      : null;
    if (route && route !== '/notifications') router.push(route as never);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    setError(false);
    try {
      await markAllRead();
    } catch {
      setError(true);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <ScreenShell reserveBottomNav={false}>
      <TouchableOpacity style={styles.backLink} onPress={goBack} accessibilityRole="button">
        <MaterialIcons name="arrow-back" size={19} color={colors.textSoft} />
        <Text style={styles.backText} i18nKey="common.goBack" />
      </TouchableOpacity>

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Eyebrow>notifications.eyebrow</Eyebrow>
          <HeroTitle>notifications.center.title</HeroTitle>
          <BodyText style={styles.heroBody}>notifications.center.body</BodyText>
        </View>
        <View style={styles.heroBell}>
          <MaterialIcons name="notifications-none" size={27} color={colors.accentCyan} />
          {unreadCount > 0 ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.filters}>
          {(['all', 'unread'] as const).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.filterButton, filter === option && styles.filterButtonActive]}
              onPress={() => setFilter(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === option }}
            >
              <Text style={[styles.filterText, filter === option && styles.filterTextActive]}>
                {option === 'all' ? t('notifications.filter.all') : t('notifications.filter.unread', { count: unreadCount })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAll}
            disabled={markingAll}
            accessibilityRole="button"
          >
            <Text style={styles.markAllText}>
              {markingAll ? t('notifications.marking') : t('notifications.markAll')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <SurfaceCard style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText} i18nKey="notifications.error.load" />
          <UiButton
            label="common.retry"
            onPress={() => {
              setError(false);
              refresh().catch(() => setError(true));
            }}
            style={styles.retryButton}
          />
        </SurfaceCard>
      ) : loading && notifications.length === 0 ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((item) => <View key={item} style={styles.skeletonCard} />)}
        </View>
      ) : visible.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialIcons
              name={filter === 'unread' ? 'done-all' : 'notifications-none'}
              size={28}
              color={colors.accentCyan}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? t('notifications.emptyUnread') : t('notifications.empty')}
          </Text>
          <Text style={styles.emptyBody} i18nKey="notifications.emptyBody" />
        </SurfaceCard>
      ) : (
        <View style={styles.list}>
          {visible.map((notification) => {
            const unread = !notification.read_at;
            return (
              <TouchableOpacity
                key={notification.id}
                style={[styles.notificationRow, unread && styles.notificationRowUnread]}
                onPress={() => openNotification(notification)}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <View style={[styles.itemIcon, unread && styles.itemIconUnread]}>
                  <MaterialIcons
                    name={notificationIcon(notification.type)}
                    size={21}
                    color={unread ? colors.accentCyan : colors.textMuted}
                  />
                </View>
                <View style={styles.itemCopy}>
                  <View style={styles.itemTitleRow}>
                    <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]} numberOfLines={2}>
                      {notification.title}
                    </Text>
                    <Text style={[styles.itemDate, unread && styles.itemDateUnread]}>
                      {relativeDate(notification.created_at, locale)}
                    </Text>
                  </View>
                  <Text style={styles.itemBody} numberOfLines={3}>{notification.body}</Text>
                </View>
                {unread ? <View style={styles.unreadDot} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  backLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  backText: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  heroCopy: { flex: 1 },
  heroBody: { maxWidth: 650, marginTop: 6 },
  heroBell: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInfo, borderWidth: 1, borderColor: colors.borderInfo },
  heroBadge: { position: 'absolute', top: -5, right: -5, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentCoral, borderWidth: 2, borderColor: colors.surface },
  heroBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  filters: { flexDirection: 'row', gap: 7 },
  filterButton: { minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: colors.accentCyan },
  markAllButton: { minHeight: 38, justifyContent: 'center' },
  markAllText: { color: colors.accentCyan, fontSize: 11, fontWeight: '900' },
  list: { gap: 8 },
  notificationRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, padding: 12 },
  notificationRowUnread: { backgroundColor: colors.surfaceInfo, borderColor: colors.borderInfo },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  itemIconUnread: { backgroundColor: colors.surface },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  itemTitle: { flex: 1, color: colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  itemTitleUnread: { color: colors.text, fontWeight: '900' },
  itemDate: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  itemDateUnread: { color: colors.accentCyan, fontWeight: '800' },
  itemBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accentCyan },
  emptyCard: { alignItems: 'center', paddingVertical: 30, backgroundColor: colors.surfaceAlt },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInfo },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 12 },
  emptyBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 390, marginTop: 5 },
  errorCard: { alignItems: 'center', gap: 9, backgroundColor: colors.surfaceDanger, borderColor: colors.borderDanger },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  retryButton: { alignSelf: 'stretch', marginTop: 3 },
  skeletonList: { gap: 8 },
  skeletonCard: { height: 88, borderRadius: radii.lg, backgroundColor: colors.surfaceMuted, opacity: 0.72 },
}));
