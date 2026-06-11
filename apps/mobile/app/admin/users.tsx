import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import { adminService, type AdminUserRow, type AdminUsersResponse } from '../../services/admin.service';

function formatNumber(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '--';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function getAdminError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 403) return 'Admin access required';
  if (status === 401) return 'Please sign in again to view admin tools.';
  return 'Could not load users right now.';
}

function UserCard({ user }: { user: AdminUserRow }) {
  return (
    <TouchableOpacity style={styles.userCardPressable} onPress={() => router.push(`/admin/users/${encodeURIComponent(user.id)}` as any)}>
      <SurfaceCard style={styles.userCard}>
        <View style={styles.userHeader}>
          <View style={styles.userIdentity}>
            <Text style={styles.userEmail}>{user.email ?? 'No email'}</Text>
            <Text style={styles.userId}>{user.id}</Text>
          </View>
          <View style={styles.planPill}>
            <Text style={styles.planText}>{user.plan_tier}</Text>
          </View>
        </View>

        <View style={styles.userStatsGrid}>
          <View style={styles.userStat}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={styles.statValue}>{user.subscription_status}</Text>
          </View>
          <View style={styles.userStat}>
            <Text style={styles.statLabel}>AI requests</Text>
            <Text style={styles.statValue}>{formatNumber(user.total_ai_requests_month)}</Text>
          </View>
          <View style={styles.userStat}>
            <Text style={styles.statLabel}>Credits</Text>
            <Text style={styles.statValue}>{formatNumber(user.credits_used_month)}</Text>
          </View>
          <View style={styles.userStat}>
            <Text style={styles.statLabel}>Food logs</Text>
            <Text style={styles.statValue}>{formatNumber(user.food_logs_count)}</Text>
          </View>
        </View>

        <View style={styles.userDates}>
          <Text style={styles.mutedText}>Created: {formatDate(user.created_at)}</Text>
          <Text style={styles.mutedText}>Last active: {formatDate(user.last_active_at)}</Text>
        </View>
      </SurfaceCard>
    </TouchableOpacity>
  );
}

export default function AdminUsersScreen() {
  const [response, setResponse] = useState<AdminUsersResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 25;
  const hasNextPage = useMemo(() => {
    if (!response) return false;
    return response.page * response.page_size < response.total;
  }, [response]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.fetchUsers({ search, plan, page, pageSize });
      setResponse(data);
    } catch (err: any) {
      setResponse(null);
      setError(getAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [search, plan, page]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const setPlanFilter = (nextPlan: string) => {
    setPage(1);
    setPlan(nextPlan);
  };

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text style={styles.title}>Users</Text>
          <Text style={styles.subtitle}>Search users, inspect plan status, monthly AI usage, credits, food logs, and last activity.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}>
          <Text style={styles.navText}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/ai-usage' as any)}>
          <Text style={styles.navText}>AI Usage</Text>
        </TouchableOpacity>
      </View>

      <SurfaceCard style={styles.filterCard}>
        <Text style={styles.sectionTitle}>Filters</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search by email"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            style={styles.searchInput}
            onSubmitEditing={applySearch}
          />
          <TouchableOpacity style={styles.filterButtonPrimary} onPress={applySearch}>
            <Text style={styles.filterButtonPrimaryText}>Search</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.planRow}>
          {['', 'free', 'premium', 'pro'].map((item) => (
            <TouchableOpacity key={item || 'all'} style={[styles.planFilter, plan === item && styles.planFilterActive]} onPress={() => setPlanFilter(item)}>
              <Text style={styles.planFilterText}>{item || 'all'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SurfaceCard>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.mutedText}>Loading users...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.mutedText}>Your account must be included in ADMIN_EMAILS or BETA_ANALYTICS_ADMIN_EMAILS.</Text>
        </SurfaceCard>
      ) : response ? (
        <View style={styles.content}>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>Results</Text>
            <Text style={styles.mutedText}>Page {response.page} · {formatNumber(response.total)} total</Text>
          </View>

          {response.users.length === 0 ? (
            <SurfaceCard style={styles.centerCard}>
              <Text style={styles.mutedText}>No users found.</Text>
            </SurfaceCard>
          ) : response.users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}

          <View style={styles.paginationRow}>
            <TouchableOpacity disabled={page <= 1} style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]} onPress={() => setPage((current) => Math.max(1, current - 1))}>
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!hasNextPage} style={[styles.pageButton, !hasNextPage && styles.pageButtonDisabled]} onPress={() => setPage((current) => current + 1)}>
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { gap: 18 },
  header: { gap: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: theme.colors.accentCyan, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, maxWidth: 720 },
  refreshButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  refreshText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  navButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 10 },
  navText: { color: theme.colors.text, fontWeight: '800' },
  filterCard: { gap: 12 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  searchInput: { flexGrow: 1, minWidth: 220, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.colors.surfaceAlt },
  filterButtonPrimary: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  filterButtonPrimaryText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  planFilter: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 14, paddingVertical: 8 },
  planFilterActive: { backgroundColor: theme.colors.accentMint },
  planFilterText: { color: theme.colors.text, fontWeight: '800' },
  content: { gap: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  userCardPressable: { width: '100%' },
  userCard: { gap: 14 },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  userIdentity: { flex: 1, gap: 4 },
  userEmail: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  userId: { color: theme.colors.textMuted, fontSize: 11 },
  planPill: { borderRadius: 999, backgroundColor: theme.colors.accentMint, paddingHorizontal: 12, paddingVertical: 6 },
  planText: { color: theme.colors.textOnAccent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  userStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  userStat: { minWidth: 120, flexGrow: 1, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, padding: 12 },
  statLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statValue: { color: theme.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  userDates: { gap: 4 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  pageButton: { borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 16, paddingVertical: 10 },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { color: theme.colors.text, fontWeight: '800' },
  centerCard: { alignItems: 'center', gap: 10 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  mutedText: { color: theme.colors.textMuted },
});
