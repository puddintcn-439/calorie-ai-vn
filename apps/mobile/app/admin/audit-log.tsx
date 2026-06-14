import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
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
    <AdminSectionCard style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <View style={styles.entryCopy}>
          <Text style={styles.actionText}>{entry.action}</Text>
          <Text style={adminStyles.muted}>by {entry.actor_email || '--'} · {formatDate(entry.created_at)}</Text>
        </View>
        <AdminStatusBadge label={entry.target_type} tone="info" />
      </View>

      <View style={adminStyles.grid}>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Target ID</Text><Text style={adminStyles.keyValue}>{entry.target_id ?? '--'}</Text></View>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Reason</Text><Text style={adminStyles.keyValue}>{entry.reason ?? '--'}</Text></View>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>IP</Text><Text style={adminStyles.keyValue}>{entry.ip_address ?? '--'}</Text></View>
      </View>

      {metadata ? (
        <View style={styles.metadataBox}>
          <Text style={adminStyles.keyLabel}>Metadata</Text>
          <Text style={styles.metadataText}>{metadata}</Text>
        </View>
      ) : null}
    </AdminSectionCard>
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
      setResponse(await adminService.fetchAuditLog({ actorEmail, action, targetType, page, pageSize }));
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
    <AdminShell
      title="Audit Log"
      subtitle="System trail cho các admin action như grant/revoke premium, quota reset và support updates."
      onRefresh={load}
    >
      <AdminSectionCard title="Filters" subtitle="Dùng để truy vết actor, action hoặc target type khi audit staging.">
        <View style={styles.filterGrid}>
          <TextInput value={actorDraft} onChangeText={setActorDraft} placeholder="Actor email" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={[adminStyles.input, styles.input]} />
          <TextInput value={actionDraft} onChangeText={setActionDraft} placeholder="Action" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={[adminStyles.input, styles.input]} />
          <TextInput value={targetTypeDraft} onChangeText={setTargetTypeDraft} placeholder="Target type" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={[adminStyles.input, styles.input]} />
        </View>
        <View style={styles.filterActions}>
          <TouchableOpacity style={adminStyles.primaryButton} onPress={applyFilters}><Text style={adminStyles.primaryButtonText}>Apply</Text></TouchableOpacity>
          <TouchableOpacity style={adminStyles.secondaryButton} onPress={clearFilters}><Text style={adminStyles.secondaryButtonText}>Clear</Text></TouchableOpacity>
        </View>
      </AdminSectionCard>

      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : response ? (
        <View style={styles.content}>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>Entries</Text>
            <Text style={adminStyles.muted}>Page {response.page} · {formatNumber(response.total)} total</Text>
          </View>

          {response.entries.length === 0 ? (
            <AdminStateCard state="empty" title="No audit entries" body="Không có audit entry phù hợp với filter hiện tại." onRetry={clearFilters} />
          ) : response.entries.map((entry) => <AuditEntryCard key={entry.id} entry={entry} />)}

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
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flexGrow: 1, minWidth: 180 },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  content: { gap: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  sectionTitle: { color: adminChrome.text, fontSize: 18, fontWeight: '900' },
  entryCard: { gap: 12 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  entryCopy: { flex: 1, gap: 4 },
  actionText: { color: adminChrome.text, fontSize: 17, fontWeight: '900' },
  metadataBox: { borderRadius: 10, backgroundColor: adminChrome.cardMuted, borderWidth: 1, borderColor: adminChrome.border, padding: 12 },
  metadataText: { color: adminChrome.textSoft, fontSize: 12, lineHeight: 18, marginTop: 6 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  pageButtonDisabled: { opacity: 0.4 },
});
