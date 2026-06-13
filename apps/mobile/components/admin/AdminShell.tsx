import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, TouchableOpacity, useWindowDimensions, View, ViewStyle } from 'react-native';
import { router, usePathname } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../ui-shell';
import { Text } from '../i18n-text';
import { theme } from '../theme';
import { useAuthStore } from '../../store/auth.store';

type AdminRoute = {
  group: 'Overview' | 'Users' | 'Billing' | 'Support' | 'AI Ops' | 'System';
  label: string;
  href?: string;
  disabled?: boolean;
};

const ADMIN_ROUTES: AdminRoute[] = [
  { group: 'Overview', label: 'Overview', href: '/admin' },
  { group: 'Users', label: 'Users', href: '/admin/users' },
  { group: 'Billing', label: 'Revenue', href: '/admin/revenue' },
  { group: 'Support', label: 'Payment Issues', href: '/admin/payment-issues' },
  { group: 'AI Ops', label: 'AI Usage', href: '/admin/ai-usage' },
  { group: 'System', label: 'Audit Log', href: '/admin/audit-log' },
];

function isActiveRoute(pathname: string, href?: string) {
  if (!href) return false;
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminHeader({
  title,
  subtitle,
  onRefresh,
  actions,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
}) {
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout().catch(() => {});
    router.replace('/admin/login' as any);
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerActions}>
        {actions}
        {onRefresh ? (
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <View style={styles.navPanel}>
      {ADMIN_ROUTES.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        const disabled = item.disabled || !item.href;

        return (
          <TouchableOpacity
            key={`${item.group}-${item.label}`}
            disabled={disabled}
            style={[styles.navItem, active && styles.navItemActive, disabled && styles.navItemDisabled]}
            onPress={() => item.href && router.push(item.href as any)}
          >
            <Text style={[styles.navGroup, active && styles.navGroupActive]}>{item.group}</Text>
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AdminShell({
  title,
  subtitle,
  onRefresh,
  actions,
  children,
  contentStyle,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 980;

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <AdminHeader title={title} subtitle={subtitle} onRefresh={onRefresh} actions={actions} />
        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <View style={styles.navColumn}>
            <AdminNav />
          </View>
          <View style={[styles.mainColumn, contentStyle]}>{children}</View>
        </View>
      </View>
    </ScreenShell>
  );
}

export function AdminSectionCard({
  title,
  subtitle,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SurfaceCard style={[styles.sectionCard, style]}>
      {title || subtitle ? (
        <View style={styles.sectionHeader}>
          {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </SurfaceCard>
  );
}

export function AdminStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function AdminStateCard({
  state,
  title,
  body,
  onRetry,
  showLogin,
}: {
  state: 'loading' | 'empty' | 'error' | 'denied';
  title?: string;
  body?: string;
  onRetry?: () => void;
  showLogin?: boolean;
}) {
  const isLoading = state === 'loading';
  const isError = state === 'error' || state === 'denied';
  const resolvedTitle = title ?? (isLoading ? 'Loading...' : state === 'empty' ? 'No data' : 'Access denied / session expired');
  const resolvedBody = body ?? (
    isLoading
      ? 'Đang tải dữ liệu admin.'
      : state === 'empty'
        ? 'Không có dữ liệu phù hợp với bộ lọc hiện tại.'
        : 'Phiên admin không hợp lệ hoặc tài khoản không có quyền truy cập.'
  );

  return (
    <AdminSectionCard style={styles.stateCard}>
      {isLoading ? <ActivityIndicator color={theme.colors.accentMint} /> : null}
      <Text style={[styles.stateTitle, isError && styles.stateTitleError]}>{resolvedTitle}</Text>
      <Text style={styles.stateBody}>{resolvedBody}</Text>
      <View style={styles.stateActions}>
        {onRetry && !isLoading ? (
          <TouchableOpacity style={styles.statePrimaryButton} onPress={onRetry}>
            <Text style={styles.statePrimaryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
        {showLogin || state === 'denied' ? (
          <TouchableOpacity style={styles.stateSecondaryButton} onPress={() => router.replace('/admin/login' as any)}>
            <Text style={styles.stateSecondaryText}>Back to admin login</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </AdminSectionCard>
  );
}

export const adminStyles = StyleSheet.create({
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { minWidth: 170, flexGrow: 1, flexBasis: 170, gap: 6 },
  metricLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },
  muted: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle },
  rowCopy: { flex: 1 },
  rowTitle: { color: theme.colors.text, fontWeight: '900' },
  rowRight: { color: theme.colors.text, fontWeight: '900', textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyBox: { minWidth: 170, flexGrow: 1, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt, padding: 12 },
  keyLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  keyValue: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  primaryButton: { borderRadius: 8, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  secondaryButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: theme.colors.text, fontWeight: '900' },
  dangerText: { color: theme.colors.danger, fontWeight: '900' },
  input: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: theme.colors.surfaceAlt, fontSize: 14 },
});

const styles = StyleSheet.create({
  scrollContent: { gap: 18 },
  shell: { gap: 16 },
  shellDesktop: { gap: 18 },
  header: { gap: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  headerCopy: { flex: 1, minWidth: 260 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: theme.colors.text, fontSize: 31, lineHeight: 36, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, maxWidth: 760, marginTop: 4 },
  refreshButton: { borderRadius: 8, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  refreshText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  logoutButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 10 },
  logoutText: { color: theme.colors.text, fontWeight: '900' },
  body: { gap: 14 },
  bodyDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  navColumn: { flexShrink: 0 },
  mainColumn: { flex: 1, gap: 14, minWidth: 0 },
  navPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navItem: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 10, minWidth: 132 },
  navItemActive: { backgroundColor: theme.colors.surfaceLifted, borderColor: theme.colors.accentMint },
  navItemDisabled: { opacity: 0.45 },
  navGroup: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  navGroupActive: { color: theme.colors.accentMint },
  navLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '900', marginTop: 3 },
  navLabelActive: { color: theme.colors.text },
  sectionCard: { gap: 12 },
  sectionHeader: { gap: 3 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badge_neutral: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.borderSubtle },
  badge_success: { backgroundColor: theme.colors.surfaceSuccess, borderColor: theme.colors.borderSuccess },
  badge_warning: { backgroundColor: theme.colors.surfaceWarning, borderColor: theme.colors.borderWarning },
  badge_danger: { backgroundColor: theme.colors.surfaceDanger, borderColor: theme.colors.borderDanger },
  badge_info: { backgroundColor: theme.colors.surfaceInfo, borderColor: theme.colors.borderInfo },
  badgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  badgeText_neutral: { color: theme.colors.textMuted },
  badgeText_success: { color: theme.colors.success },
  badgeText_warning: { color: theme.colors.warning },
  badgeText_danger: { color: theme.colors.danger },
  badgeText_info: { color: theme.colors.info },
  stateCard: { alignItems: 'center', gap: 8 },
  stateTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  stateTitleError: { color: theme.colors.danger },
  stateBody: { color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  stateActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 4 },
  statePrimaryButton: { borderRadius: 8, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  statePrimaryText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  stateSecondaryButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 16, paddingVertical: 10 },
  stateSecondaryText: { color: theme.colors.text, fontWeight: '900' },
});
