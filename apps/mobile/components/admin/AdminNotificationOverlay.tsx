import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '../i18n-text';
import { useAdminNotificationStore } from '../../store/admin-notification.store';

const colors = {
  accent: '#635bff',
  border: '#d7dce3',
  text: '#0f172a',
  textMuted: '#64748b',
};

export function AdminNotificationOverlay() {
  const toast = useAdminNotificationStore((state) => state.toast);
  const refresh = useAdminNotificationStore((state) => state.refresh);
  const markRead = useAdminNotificationStore((state) => state.markRead);
  const dismissToast = useAdminNotificationStore((state) => state.dismissToast);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    refresh().catch(() => {});
    const timer = setInterval(() => refresh(true).catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      damping: 18,
      stiffness: 180,
    }).start();
    const timer = setTimeout(dismissToast, 6000);
    return () => clearTimeout(timer);
  }, [dismissToast, progress, toast]);

  if (!toast) return null;

  const openToast = () => {
    markRead(toast.id);
    router.push(toast.route as any);
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity style={styles.toastBody} onPress={openToast} activeOpacity={0.88}>
        <View style={styles.iconBox}>
          <Ionicons name={toast.type === 'payment_issue' ? 'card-outline' : 'chatbubble-ellipses-outline'} size={20} color="#ffffff" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.kicker}>New admin notification</Text>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          <Text style={styles.body} numberOfLines={1}>{toast.body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 18,
    right: 22,
    width: 360,
    maxWidth: '88%',
    zIndex: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)' } as any,
      default: { elevation: 8 },
    }),
  },
  toastBody: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconBox: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  body: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
