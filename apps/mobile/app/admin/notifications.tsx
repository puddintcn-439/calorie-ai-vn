import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminStatusBadge,
  AdminTone,
  adminChrome,
} from '../../components/admin/AdminShell';
import { AdminNotification } from '../../services/admin.service';
import { useAdminNotificationStore } from '../../store/admin-notification.store';

type Filter = 'all' | 'unread';

function formatDate(value: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleString();
}

function notificationTone(item: AdminNotification): AdminTone {
  if (!item.needs_attention) return 'success';
  return item.type === 'payment_issue' ? 'billing' : 'support';
}

export default function AdminNotificationsScreen() {
  const notifications = useAdminNotificationStore((state) => state.notifications);
  const seenIds = useAdminNotificationStore((state) => state.seenIds);
  const unreadCount = useAdminNotificationStore((state) => state.unreadCount);
  const loading = useAdminNotificationStore((state) => state.loading);
  const refresh = useAdminNotificationStore((state) => state.refresh);
  const markRead = useAdminNotificationStore((state) => state.markRead);
  const markAllRead = useAdminNotificationStore((state) => state.markAllRead);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => refresh(), [refresh]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const seen = useMemo(() => new Set(seenIds), [seenIds]);
  const filtered = useMemo(
    () => filter === 'unread'
      ? notifications.filter((item) => item.needs_attention && !seen.has(item.id))
      : notifications,
    [filter, notifications, seen],
  );

  const openNotification = (item: AdminNotification) => {
    markRead(item.id);
    router.push(item.route as any);
  };

  return (
    <AdminShell
      title="Notifications"
      subtitle="Support requests and payment events that need an admin response."
      onRefresh={load}
      actions={unreadCount > 0 ? (
        <TouchableOpacity style={styles.markAllButton} onPress={markAllRead}>
          <Ionicons name="checkmark-done" size={17} color={adminChrome.text} />
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      ) : null}
    >
      <View style={styles.summaryRow}>
        <AdminSectionCard style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="notifications-outline" size={25} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.summaryValue}>{unreadCount}</Text>
            <Text style={styles.summaryLabel}>Unread notifications</Text>
          </View>
        </AdminSectionCard>
        <View style={styles.filters}>
          {(['all', 'unread'] as const).map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.filterButton, filter === value && styles.filterButtonActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
                {value === 'all' ? `All · ${notifications.length}` : `Unread · ${unreadCount}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && notifications.length === 0 ? (
        <AdminSectionCard style={styles.loadingCard}>
          <ActivityIndicator color={adminChrome.accent} />
          <Text style={styles.muted}>Loading notification center...</Text>
        </AdminSectionCard>
      ) : filtered.length === 0 ? (
        <AdminStateCard
          state="empty"
          title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
          body={filter === 'unread' ? 'New user requests will appear here automatically.' : 'Support and payment events will be collected here.'}
        />
      ) : (
        <AdminSectionCard style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Recent activity</Text>
            <Text style={styles.listSubtitle}>Click a notification to open the related admin queue.</Text>
          </View>
          <View style={styles.list}>
            {filtered.map((item) => {
              const unread = item.needs_attention && !seen.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.notificationRow, unread && styles.notificationRowUnread]}
                  onPress={() => openNotification(item)}
                  activeOpacity={0.78}
                >
                  <View style={[styles.itemIcon, item.type === 'payment_issue' ? styles.paymentIcon : styles.supportIcon]}>
                    <Ionicons
                      name={item.type === 'payment_issue' ? 'card-outline' : 'chatbubble-ellipses-outline'}
                      size={20}
                      color={item.type === 'payment_issue' ? '#047857' : '#0f766e'}
                    />
                  </View>
                  <View style={styles.itemCopy}>
                    <View style={styles.itemTitleRow}>
                      <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]} numberOfLines={1}>{item.title}</Text>
                      {unread ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
                    <View style={styles.itemMeta}>
                      <AdminStatusBadge label={item.status} tone={notificationTone(item)} />
                      <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={adminChrome.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </AdminSectionCard>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryCard: { minWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  summaryIcon: { width: 46, height: 46, borderRadius: 11, backgroundColor: adminChrome.accent, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { color: adminChrome.text, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  summaryLabel: { color: adminChrome.textMuted, fontSize: 12, marginTop: 1 },
  filters: { flexDirection: 'row', gap: 8 },
  filterButton: { borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 9 },
  filterButtonActive: { borderColor: adminChrome.accent, backgroundColor: adminChrome.accentSoft },
  filterText: { color: adminChrome.textMuted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: adminChrome.accent },
  markAllButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: '#ffffff', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  markAllText: { color: adminChrome.text, fontSize: 12, fontWeight: '800' },
  loadingCard: { alignItems: 'center', paddingVertical: 40 },
  muted: { color: adminChrome.textMuted, fontSize: 12 },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  listHeader: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 13 },
  listTitle: { color: adminChrome.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  listSubtitle: { color: adminChrome.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  list: { borderTopWidth: 1, borderTopColor: adminChrome.border, overflow: 'hidden' },
  notificationRow: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: adminChrome.border, backgroundColor: '#ffffff' },
  notificationRowUnread: { backgroundColor: '#f5f4ff' },
  itemIcon: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  supportIcon: { backgroundColor: '#ecfeff' },
  paymentIcon: { backgroundColor: '#ecfdf5' },
  itemCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flexShrink: 1, color: adminChrome.textSoft, fontSize: 14, fontWeight: '700' },
  itemTitleUnread: { color: adminChrome.text, fontWeight: '900' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: adminChrome.accent },
  itemBody: { color: adminChrome.textMuted, fontSize: 12, lineHeight: 17 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  itemDate: { color: adminChrome.textMuted, fontSize: 11, fontWeight: '600' },
});
