import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import { adminService, type AdminAuditLogEntry, type AdminAuditLogResponse } from '../../services/admin.service';

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '--';
}

function adminError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 403) return 'Admin access required';
  if (status === 401) return 'Please sign in again.';
  return 'Could not load audit log.';
}

function compactJson(value: any) {
  if (!value || Object.keys(value).length === 0) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function AuditEntryCard({ entry }: { entry: AdminAuditLogEntry }) {
  const metadata = compactJson(entry.metadata);
  return (
    <SurfaceCard style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <View style={styles.entryCopy}>
          <Text style={styles.actionText}>{entry.action}</Text>
          <Text style={styles.muted}>by {entry.actor_email || '--'} · {formatDate(entry.created_at)}</Text>
        </View>
        <View style={styles.targetPill}>
          <Text style={styles.targetText}>{entry.target_type}</Text>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Target ID</Text>
          <Text style={styles.detailValue}>{entry.target_id ?? '--'}</Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>Reason</Text>
          <Text style={styles.detailValue}>{entry.reason ?? '--'}</Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>IP</Text>
          <Text style={styles.detailValue}>{entry.ip_address ?? '--'}</Text>
        </View>
      </View>

      {metadata ? (
        <View style={styles.metadataBox}>
          <Text style={styles.detailLabel}>Metadata</Text>
          <Text style={styles.metadataText}>{metadata}</Text>
        </View>
      ) : null}
    </SurfaceCard>
  );
}

export default function AdminAuditLogScreen() {
  const [response, setResponse] = useState<AdminAuditLogResponse | null>(null);
  const [actorDraft, setActorDraft] = useState('');
  const [actionDraft, setActionDraft] = useState('');
  const [targetTypeDraft, setTargetTypeDraft] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
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
      const data = await adminService.fetchAuditLog({ actorEmail, action, targetType, page, pageSize });
      setResponse(data);
    } catch (err: any) {
      setResponse(null);
      setError(adminError(err));
    } finally {
      setLoading(false);
    }
  }, [actorEmail, action, targetType, page]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setActorEmail(actorDraft.trim());
    setAction(actionDraft.trim());
    setTargetType(targetTypeDraft.trim());
  };

  const clearFilters = () => {
    setActorDraft('');
    setActionDraft('');
    setTargetTypeDraft('');
    setActorEmail('');
    setAction('');
    setTargetType('');
    setPage(1);
  };

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE V2</Text>
          <Text style={styles.title}>Audit Log</Text>
          <Text style={styles.subtitle}>Track admin actions before enabling write operations such as quota reset or premium grants.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}><Text style={styles.navText}>Overview</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}><Text style={styles.navText}>Users</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/ai-usage' as any)}><Text style={styles.navText}>AI Usage</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/revenue' as any)}><Text style={styles.navText}>Revenue</Text></TouchableOpacity>
      </View>

      <SurfaceCard style={styles.filterCard}>
        <Text style={styles.sectionTitle}>Filters</Text>
        <View style={styles.filterGrid}>
          <TextInput value={actorDraft} onChangeText={setActorDraft} placeholder="Actor email" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={styles.input} />
          <TextInput value={actionDraft} onChangeText={setActionDraft} placeholder="Action" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={styles.input} />
          <TextInput value={targetTypeDraft} onChangeText={setTargetTypeDraft} placeholder="Target type" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={styles.input} />
        </View>
        <View style={styles.filterActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={applyFilters}><Text style={styles.primaryButtonText}>Apply</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={clearFilters}><Text style={styles.secondaryButtonText}>Clear</Text></TouchableOpacity>
        </View>
      </SurfaceCard>

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={theme.colors.accentMint} />
          <Text style={styles.muted}>Loading audit log...</Text>
        </SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.muted}>Your account must be included in ADMIN_EMAILS or BETA_ANALYTICS_ADMIN_EMAILS.</Text>
        </SurfaceCard>
      ) : response ? (
        <View style={styles.content}>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>Entries</Text>
            <Text style={styles.muted}>Page {response.page} · {formatNumber(response.total)} total</Text>
          </View>

          {response.entries.length === 0 ? (
            <SurfaceCard style={styles.centerCard}>
              <Text style={styles.muted}>No audit entries found.</Text>
            </SurfaceCard>
          ) : response.entries.map((entry) => <AuditEntryCard key={entry.id} entry={entry} />)}

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
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flexGrow: 1, minWidth: 180, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.colors.surfaceAlt },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryButton: { borderRadius: 14, backgroundColor: theme.colors.accentMint, paddingHorizontal: 16, paddingVertical: 10 },
  primaryButtonText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  secondaryButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 16, paddingVertical: 10 },
  secondaryButtonText: { color: theme.colors.text, fontWeight: '900' },
  content: { gap: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  entryCard: { gap: 12 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  entryCopy: { flex: 1, gap: 4 },
  actionText: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  targetPill: { borderRadius: 999, backgroundColor: theme.colors.accentMint, paddingHorizontal: 12, paddingVertical: 6 },
  targetText: { color: theme.colors.textOnAccent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailBox: { minWidth: 160, flexGrow: 1, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, padding: 12 },
  detailLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { color: theme.colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  metadataBox: { borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, padding: 12 },
  metadataText: { color: theme.colors.text, fontSize: 12, marginTop: 6 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  pageButton: { borderRadius: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 16, paddingVertical: 10 },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { color: theme.colors.text, fontWeight: '800' },
  centerCard: { alignItems: 'center', gap: 10 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  muted: { color: theme.colors.textMuted, fontSize: 12 },
});
