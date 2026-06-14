import React, { ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleProp, StyleSheet, TouchableOpacity, useWindowDimensions, View, ViewStyle } from 'react-native';
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

export const adminChrome = {
  pageBg: '#f3f6fb',
  sidebarBg: '#ffffff',
  cardBg: '#ffffff',
  cardMuted: '#f7f9fc',
  border: '#e5e7eb',
  borderStrong: '#d7dce3',
  text: '#0f172a',
  textMuted: '#64748b',
  textSoft: '#334155',
  accent: '#635bff',
  accentSoft: '#f0efff',
  cyan: '#06b6d4',
  mint: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  successSoft: '#ecfdf3',
  warningSoft: '#fff7ed',
  dangerSoft: '#fff1f2',
  infoSoft: '#eef6ff',
};

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
  showLogout = true,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
  showLogout?: boolean;
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
        {showLogout ? (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function AdminNav({ mode = 'compact' }: { mode?: 'compact' | 'sidebar' }) {
  const pathname = usePathname();
  const isSidebar = mode === 'sidebar';

  return (
    <View style={[styles.navPanel, isSidebar && styles.navPanelSidebar]}>
      {ADMIN_ROUTES.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        const disabled = item.disabled || !item.href;

        return (
          <TouchableOpacity
            key={`${item.group}-${item.label}`}
            disabled={disabled}
            style={[
              styles.navItem,
              isSidebar && styles.navItemSidebar,
              active && styles.navItemActive,
              active && isSidebar && styles.navItemSidebarActive,
              disabled && styles.navItemDisabled,
            ]}
            onPress={() => item.href && router.push(item.href as any)}
          >
            {!isSidebar ? <Text style={[styles.navGroup, active && styles.navGroupActive]}>{item.group}</Text> : null}
            <Text style={[styles.navLabel, isSidebar && styles.navLabelSidebar, active && styles.navLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AdminSidebar() {
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout().catch(() => {});
    router.replace('/admin/login' as any);
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarTop}>
        <View style={styles.sidebarBrand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>C</Text>
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.sidebarTitle}>Calorie AI</Text>
            <Text style={styles.sidebarEyebrow}>Admin Console</Text>
          </View>
        </View>
        <AdminNav mode="sidebar" />
      </View>

      <View style={styles.sidebarFooter}>
        <Text style={styles.sidebarFooterText}>Production tools</Text>
        <TouchableOpacity style={styles.sidebarLogoutButton} onPress={handleLogout}>
          <Text style={styles.sidebarLogoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
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
  const isDesktop = width >= 840;

  return (
    <ScreenShell
      scroll
      contentStyle={styles.screenContent}
      scrollContentStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
      reserveBottomNav={false}
    >
      <View style={[styles.shell, isDesktop ? styles.shellDesktop : styles.shellMobile]}>
        {isDesktop ? (
          <>
            <AdminSidebar />
            <View style={[styles.mainPanel, contentStyle]}>
              <AdminHeader title={title} subtitle={subtitle} onRefresh={onRefresh} actions={actions} showLogout={false} />
              {children}
            </View>
          </>
        ) : (
          <View style={[styles.mobilePanel, contentStyle]}>
            <AdminHeader title={title} subtitle={subtitle} onRefresh={onRefresh} actions={actions} />
            <AdminNav mode="compact" />
            {children}
          </View>
        )}
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
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' },
  metricCard: { minWidth: 260, flexGrow: 1, flexShrink: 1, flexBasis: '31%', gap: 6, minHeight: 116, justifyContent: 'space-between' },
  metricLabel: { color: adminChrome.textMuted, fontSize: 11, fontWeight: '700' },
  metricValue: { color: adminChrome.text, fontSize: 25, lineHeight: 31, fontWeight: '800' },
  muted: { color: adminChrome.textMuted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: adminChrome.border },
  rowCopy: { flex: 1 },
  rowTitle: { color: adminChrome.text, fontWeight: '700' },
  rowRight: { color: adminChrome.text, fontWeight: '800', textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyBox: { minWidth: 160, flexGrow: 1, borderRadius: 8, backgroundColor: adminChrome.cardMuted, padding: 11, borderWidth: 1, borderColor: adminChrome.border },
  keyLabel: { color: adminChrome.textMuted, fontSize: 11, fontWeight: '700' },
  keyValue: { color: adminChrome.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  primaryButton: { borderRadius: 7, backgroundColor: adminChrome.text, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { borderRadius: 7, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: adminChrome.text, fontWeight: '800' },
  dangerText: { color: theme.colors.danger, fontWeight: '900' },
  input: { borderRadius: 7, borderWidth: 1, borderColor: adminChrome.borderStrong, color: adminChrome.text, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: adminChrome.cardBg, fontSize: 14 },
});

const styles = StyleSheet.create({
  screenContent: { width: '100%', maxWidth: 1440 },
  scrollContent: { gap: 0 },
  scrollContentDesktop: { paddingHorizontal: 0, paddingTop: 0 },
  shell: { width: '100%' },
  shellMobile: { gap: 14, backgroundColor: adminChrome.pageBg },
  shellDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: 0, minHeight: 760, backgroundColor: adminChrome.pageBg, borderRadius: 10, overflow: 'visible', borderWidth: 1, borderColor: adminChrome.border },
  header: { gap: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: adminChrome.border },
  headerCopy: { flex: 1, minWidth: 260 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  eyebrow: { color: adminChrome.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  title: { color: adminChrome.text, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { color: adminChrome.textMuted, fontSize: 14, lineHeight: 20, maxWidth: 760, marginTop: 3 },
  refreshButton: { borderRadius: 7, backgroundColor: adminChrome.text, paddingHorizontal: 14, paddingVertical: 9 },
  refreshText: { color: '#ffffff', fontWeight: '800' },
  logoutButton: { borderRadius: 7, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 14, paddingVertical: 9 },
  logoutText: { color: adminChrome.text, fontWeight: '800' },
  mobilePanel: { gap: 14 },
  mainPanel: { flex: 1, minWidth: 0, gap: 18, paddingHorizontal: 28, paddingVertical: 26, backgroundColor: adminChrome.pageBg },
  sidebar: {
    width: 270,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: adminChrome.border,
    backgroundColor: adminChrome.sidebarBg,
    paddingHorizontal: 12,
    paddingVertical: 16,
    minHeight: 760,
    justifyContent: 'space-between',
  },
  sidebarTop: { gap: 18 },
  sidebarBrand: { paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 30, height: 30, borderRadius: 7, backgroundColor: adminChrome.text, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  brandCopy: { gap: 1 },
  sidebarEyebrow: { color: adminChrome.textMuted, fontSize: 12, fontWeight: '600' },
  sidebarTitle: { color: adminChrome.text, fontSize: 15, fontWeight: '800' },
  sidebarFooter: { gap: 9, paddingTop: 12, borderTopWidth: 1, borderTopColor: adminChrome.border },
  sidebarFooterText: { color: adminChrome.textMuted, fontSize: 11, fontWeight: '700', paddingHorizontal: 8 },
  sidebarLogoutButton: { borderRadius: 7, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 12, paddingVertical: 10 },
  sidebarLogoutText: { color: adminChrome.text, fontWeight: '800', textAlign: 'center' },
  navPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navPanelSidebar: { flexDirection: 'column', gap: 4, width: '100%', paddingRight: 2 },
  navItem: { borderRadius: 7, borderWidth: 1, borderColor: adminChrome.border, backgroundColor: adminChrome.cardBg, paddingHorizontal: 12, paddingVertical: 9, minWidth: 118 },
  navItemSidebar: { minWidth: 0, width: '100%', borderColor: 'transparent', backgroundColor: 'transparent', borderLeftWidth: 0, paddingVertical: 9, paddingHorizontal: 12 },
  navItemActive: { backgroundColor: adminChrome.accentSoft, borderColor: adminChrome.accent },
  navItemSidebarActive: { backgroundColor: adminChrome.accentSoft, borderColor: adminChrome.accent },
  navItemDisabled: { opacity: 0.45 },
  navGroup: { color: adminChrome.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  navGroupActive: { color: adminChrome.accent },
  navLabel: { color: adminChrome.textSoft, fontSize: 14, fontWeight: '700', marginTop: 3 },
  navLabelSidebar: { marginTop: 0, fontSize: 14 },
  navLabelActive: { color: adminChrome.accent },
  sectionCard: {
    gap: 12,
    backgroundColor: adminChrome.cardBg,
    borderColor: adminChrome.border,
    padding: 16,
    elevation: 0,
    ...(Platform.OS === 'web' ? { boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.04)' } as any : { shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }),
  },
  sectionHeader: { gap: 2, paddingBottom: 2 },
  sectionTitle: { color: adminChrome.text, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: adminChrome.textMuted, fontSize: 12, lineHeight: 18 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  badge_neutral: { backgroundColor: adminChrome.cardMuted, borderColor: adminChrome.border },
  badge_success: { backgroundColor: adminChrome.successSoft, borderColor: '#bbf7d0' },
  badge_warning: { backgroundColor: adminChrome.warningSoft, borderColor: '#fed7aa' },
  badge_danger: { backgroundColor: adminChrome.dangerSoft, borderColor: '#fecdd3' },
  badge_info: { backgroundColor: adminChrome.infoSoft, borderColor: '#bfdbfe' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeText_neutral: { color: adminChrome.textMuted },
  badgeText_success: { color: '#15803d' },
  badgeText_warning: { color: '#c2410c' },
  badgeText_danger: { color: '#be123c' },
  badgeText_info: { color: '#2563eb' },
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
