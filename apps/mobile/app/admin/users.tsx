import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminStatusBadge,
  adminChrome,
  adminStyles,
} from '../../components/admin/AdminShell';
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
      <AdminSectionCard style={[styles.userCard, user.plan_tier === 'free' ? styles.userCardFree : styles.userCardPaid]}>
        <View style={styles.userHeader}>
          <View style={styles.userIdentity}>
            <Text style={styles.userEmail}>{user.email ?? 'No email'}</Text>
            <Text style={styles.userId}>{user.id}</Text>
          </View>
          <AdminStatusBadge label={user.plan_tier || 'free'} tone={user.plan_tier === 'free' ? 'neutral' : 'success'} />
        </View>
        <View style={adminStyles.grid}>
          <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Status</Text><Text style={adminStyles.keyValue}>{user.subscription_status}</Text></View>
          <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>AI requests</Text><Text style={adminStyles.keyValue}>{formatNumber(user.total_ai_requests_month)}</Text></View>
          <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Credits</Text><Text style={adminStyles.keyValue}>{formatNumber(user.credits_used_month)}</Text></View>
          <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Food logs</Text><Text style={adminStyles.keyValue}>{formatNumber(user.food_logs_count)}</Text></View>
        </View>
        <View style={styles.userDates}>
          <Text style={adminStyles.muted}>Created: {formatDate(user.created_at)}</Text>
          <Text style={adminStyles.muted}>Last active: {formatDate(user.last_active_at)}</Text>
        </View>
      </AdminSectionCard>
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
  const hasNextPage = useMemo(() => response ? response.page * response.page_size < response.total : false, [response]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setResponse(await adminService.fetchUsers({ search, plan, page, pageSize }));
    } catch (err: any) {
      setResponse(null);
      setError(getAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [search, plan, page]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
  };
  const setPlanFilter = (nextPlan: string) => {
    setPage(1);
    setPlan(nextPlan);
  };
  const clearFilters = () => {
    setSearchDraft('');
    setSearch('');
    setPlan('');
    setPage(1);
  };

  return (
    <AdminShell
      title="Users"
      subtitle="Tìm user, kiểm tra plan, quota, credits và hoạt động gần đây trước khi đi vào user detail."
      onRefresh={load}
    >
      <AdminSectionCard title="Search and filters" subtitle="Search theo email. Plan filter chỉ đổi query, không thay đổi dữ liệu.">
        <View style={styles.searchRow}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search by email"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            style={[adminStyles.input, styles.searchInput]}
            onSubmitEditing={applySearch}
          />
          <TouchableOpacity style={adminStyles.primaryButton} onPress={applySearch}>
            <Text style={adminStyles.primaryButtonText}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={adminStyles.secondaryButton} onPress={clearFilters}>
            <Text style={adminStyles.secondaryButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.planRow}>
          {['', 'free', 'premium', 'pro'].map((item) => (
            <TouchableOpacity key={item || 'all'} style={[styles.planFilter, plan === item && styles.planFilterActive]} onPress={() => setPlanFilter(item)}>
              <Text style={[styles.planFilterText, plan === item && styles.planFilterTextActive]}>{item || 'all'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </AdminSectionCard>

      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : response ? (
        <View style={styles.content}>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>Results</Text>
            <Text style={adminStyles.muted}>Page {response.page} · {formatNumber(response.total)} total</Text>
          </View>
          {response.users.length === 0 ? (
            <AdminStateCard state="empty" title="No users" body="Không có user phù hợp với search/filter hiện tại." onRetry={clearFilters} />
          ) : response.users.map((user) => <UserCard key={user.id} user={user} />)}
          <View style={styles.paginationRow}>
            <TouchableOpacity disabled={page <= 1} style={[adminStyles.secondaryButton, page <= 1 && styles.pageButtonDisabled]} onPress={() => setPage((current) => Math.max(1, current - 1))}>
              <Text style={adminStyles.secondaryButtonText}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!hasNextPage} style={[adminStyles.secondaryButton, !hasNextPage && styles.pageButtonDisabled]} onPress={() => setPage((current) => current + 1)}>
              <Text style={adminStyles.secondaryButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <AdminStateCard state="empty" />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  searchInput: { flexGrow: 1, minWidth: 220 },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  planFilter: { borderRadius: 999, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 14, paddingVertical: 8 },
  planFilterActive: { backgroundColor: adminChrome.accentSoft, borderColor: adminChrome.accent },
  planFilterText: { color: adminChrome.textSoft, fontWeight: '800' },
  planFilterTextActive: { color: adminChrome.accent },
  content: { gap: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  sectionTitle: { color: adminChrome.text, fontSize: 18, fontWeight: '900' },
  userCardPressable: { borderRadius: 8 },
  userCard: { gap: 12, borderLeftWidth: 4 },
  userCardFree: { borderLeftColor: adminChrome.textMuted },
  userCardPaid: { borderLeftColor: adminChrome.mint },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  userIdentity: { flex: 1, gap: 4 },
  userEmail: { color: adminChrome.text, fontSize: 16, fontWeight: '900' },
  userId: { color: adminChrome.textMuted, fontSize: 11 },
  userDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  paginationRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  pageButtonDisabled: { opacity: 0.45 },
});
