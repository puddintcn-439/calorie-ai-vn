import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from './i18n-text';
import { useI18n } from './i18n';
import { useAppTheme } from './theme';
import { pushNotificationService } from '../services/push-notification.service';
import { useNotificationStore } from '../store/notification.store';

export function NotificationCenterOverlay({ topInset = 0 }: { topInset?: number }) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const toast = useNotificationStore((state) => state.toast);
  const refresh = useNotificationStore((state) => state.refresh);
  const ingestPush = useNotificationStore((state) => state.ingestPush);
  const dismissToast = useNotificationStore((state) => state.dismissToast);
  const markRead = useNotificationStore((state) => state.markRead);
  const toastY = useRef(new Animated.Value(-24)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    refresh().catch(() => {});
    const interval = setInterval(() => refresh(true).catch(() => {}), 20_000);
    const foreground = pushNotificationService.onNotificationReceived((notification) => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as Record<string, any>;
      ingestPush({
        id: String(data.notification_id ?? notification.request.identifier),
        type: String(data.type ?? 'push'),
        title: String(content.title ?? t('notifications.title')),
        body: String(content.body ?? ''),
        metadata: data,
        read_at: null,
        created_at: new Date().toISOString(),
      });
    });
    return () => {
      clearInterval(interval);
      foreground.remove();
    };
  }, [ingestPush, refresh, t]);

  useEffect(() => {
    if (!toast) return undefined;
    toastY.setValue(-24);
    toastOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(toastY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    const timer = setTimeout(dismissToast, 5200);
    return () => clearTimeout(timer);
  }, [dismissToast, toast, toastOpacity, toastY]);

  const openNotification = async () => {
    if (!toast) return;
    await markRead(toast.id).catch(() => {});
    const route = typeof toast.metadata?.route === 'string' ? toast.metadata.route : '/notifications';
    dismissToast();
    router.push(route as never);
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <TouchableOpacity
        style={[
          styles.bellButton,
          {
            top: topInset + 8,
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            shadowColor: colors.shadow,
          },
        ]}
        onPress={() => router.push('/notifications' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.open')}
      >
        <MaterialIcons name="notifications-none" size={25} color={colors.textSoft} />
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.accentCoral, borderColor: colors.surface }]}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {toast ? (
        <Animated.View
          style={[
            styles.toast,
            {
              top: topInset + 60,
              opacity: toastOpacity,
              transform: [{ translateY: toastY }],
              backgroundColor: colors.surfaceLifted,
              borderColor: colors.borderInfo,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <TouchableOpacity style={styles.toastPressable} onPress={openNotification} activeOpacity={0.88}>
            <View style={[styles.toastIcon, { backgroundColor: colors.surfaceInfo }]}>
              <MaterialIcons name="notifications-active" size={20} color={colors.accentCyan} />
            </View>
            <View style={styles.toastCopy}>
              <Text style={[styles.toastLabel, { color: colors.accentCyan }]} i18nKey="notifications.new" />
              <Text style={[styles.toastTitle, { color: colors.text }]} numberOfLines={1}>{toast.title}</Text>
              <Text style={[styles.toastBody, { color: colors.textMuted }]} numberOfLines={2}>{toast.body}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toastClose}
            onPress={dismissToast}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <MaterialIcons name="close" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 12,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 12, fontWeight: '900' },
  toast: {
    position: 'absolute',
    right: 18,
    width: '88%',
    maxWidth: 390,
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    zIndex: 29,
    elevation: 11,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  toastPressable: { flex: 1, minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, paddingRight: 34 },
  toastIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  toastCopy: { flex: 1, minWidth: 0 },
  toastLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  toastTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  toastBody: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  toastClose: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
