import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import { adminService, type AdminPaymentIssue, type AdminPaymentIssuesResponse } from '../../services/admin.service';

const STATUS_OPTIONS: Array<'open' | 'in_review' | 'resolved' | 'rejected'> = ['open', 'in_review', 'resolved', 'rejected'];

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function formatVnd(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString('vi-VN')}đ` : '--';
}

function getAdminError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  if (status === 403) return 'Admin support permission required.';
  if (status === 401) return 'Please sign in again to view admin tools.';
  return 'Could not load payment issues right now.';
}

function IssueCard({ issue, onUpdated }: { issue: AdminPaymentIssue; onUpdated: () => void }) {
  const [status, setStatus] = useState<'open' | 'in_review' | 'resolved' | 'rejected'>(
    STATUS_OPTIONS.includes(issue.status as any) ? issue.status as any : 'open',
  );
  const [adminNote, setAdminNote] = useState(issue.admin_note ?? '');
  const [resolution, setResolution] = useState(issue.resolution ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await adminService.updatePaymentIssue(issue.id, { status, admin_note: adminNote, resolution });
      setMessage('Updated and audited.');
      onUpdated();
    } catch (error: any) {
      setMessage(error?.response?.data?.message ?? error?.message ?? 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const invoice = issue.invoice ?? {};
  const orderCode = invoice.order_code ?? invoice.provider_invoice_id ?? '--';

  return (
    <SurfaceCard style={styles.issueCard}>
      <View style={styles.issueHeader}>
        <View style={styles.issueIdentity}>
          <Text style={styles.issueTitle}>{issue.issue_type ?? 'payment_issue'}</Text>
          <Text style={styles.mutedText}>{issue.user_email ?? issue.user_id ?? 'Unknown user'}</Text>
        </View>
        <View style={styles.statusPill}><Text style={styles.statusPillText}>{issue.status}</Text></View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Provider</Text><Text style={styles.summaryValue}>{issue.provider ?? '--'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Order</Text><Text style={styles.summaryValue}>{orderCode}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Amount</Text><Text style={styles.summaryValue}>{formatVnd(invoice.amount_vnd)}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Created</Text><Text style={styles.summaryValue}>{formatDate(issue.created_at)}</Text></View>
      </View>

      {issue.user_message ? <Text style={styles.userMessage}>{issue.user_message}</Text> : null}

      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.statusButton, status === option && styles.statusButtonActive]}
            onPress={() => setStatus(option)}
          >
            <Text style={[styles.statusButtonText, status === option && styles.statusButtonTextActive]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        value={adminNote}
        onChangeText={setAdminNote}
        placeholder="Admin note"
        placeholderTextColor={theme.colors.textMuted}
        multiline
        maxLength={2000}
        style={styles.input}
        textAlignVertical="top"
      />
      <TextInput
        value={resolution}
        onChangeText={setResolution}
        placeholder="Resolution"
        placeholderTextColor={theme.colors.textMuted}
        multiline
        maxLength={2000}
        style={styles.input}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color={theme.colors.textOnAccent} /> : <Text style={styles.saveButtonText}>Save update</Text>}
      </TouchableOpacity>
      {message ? <Text style={styles.mutedText}>{message}</Text> : null}
    </SurfaceCard>
  );
}

export default function AdminPaymentIssuesScreen() {
  const [response, setResponse] = useState<AdminPaymentIssuesResponse | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setResponse(await adminService.fetchPaymentIssues({ status: status || undefined, provider: 'payos' }));
    } catch (err: any) {
      setResponse(null);
      setError(getAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return (
    <ScreenShell scroll scrollContentStyle={styles.scrollContent} reserveBottomNav={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text style={styles.title}>Payment Issues</Text>
          <Text style={styles.subtitle}>Review PayOS support cases. Updates are audited and do not mutate entitlement or refunds.</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin' as any)}><Text style={styles.navText}>Overview</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/users' as any)}><Text style={styles.navText}>Users</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/revenue' as any)}><Text style={styles.navText}>Revenue</Text></TouchableOpacity>
      </View>

      <SurfaceCard style={styles.filterCard}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.statusRow}>
          {['', ...STATUS_OPTIONS].map((option) => (
            <TouchableOpacity
              key={option || 'all'}
              style={[styles.statusButton, status === option && styles.statusButtonActive]}
              onPress={() => setStatus(option)}
            >
              <Text style={[styles.statusButtonText, status === option && styles.statusButtonTextActive]}>{option || 'all'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SurfaceCard>

      {loading ? (
        <SurfaceCard style={styles.centerCard}><ActivityIndicator color={theme.colors.accentMint} /><Text style={styles.mutedText}>Loading payment issues...</Text></SurfaceCard>
      ) : error ? (
        <SurfaceCard style={styles.centerCard}><Text style={styles.errorTitle}>{error}</Text></SurfaceCard>
      ) : response && response.issues.length > 0 ? (
        <View style={styles.content}>
          <Text style={styles.mutedText}>{response.total} payment issue case(s)</Text>
          {response.issues.map((issue) => <IssueCard key={issue.id} issue={issue} onUpdated={load} />)}
        </View>
      ) : (
        <SurfaceCard style={styles.centerCard}><Text style={styles.mutedText}>No payment issues found.</Text></SurfaceCard>
      )}
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
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 8 },
  statusButtonActive: { backgroundColor: theme.colors.accentMint, borderColor: theme.colors.accentMint },
  statusButtonText: { color: theme.colors.text, fontSize: 12, fontWeight: '800' },
  statusButtonTextActive: { color: theme.colors.textOnAccent },
  centerCard: { alignItems: 'center', gap: 10 },
  content: { gap: 12 },
  issueCard: { gap: 12 },
  issueHeader: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' },
  issueIdentity: { flex: 1, gap: 4 },
  issueTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  statusPill: { borderRadius: 999, backgroundColor: theme.colors.surfaceInfo, borderColor: theme.colors.borderInfo, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { color: theme.colors.info, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { flexGrow: 1, minWidth: 130, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, padding: 10 },
  summaryLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  summaryValue: { color: theme.colors.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  userMessage: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 74, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20 },
  saveButton: { minHeight: 42, borderRadius: 14, backgroundColor: theme.colors.accentMint, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  saveButtonText: { color: theme.colors.textOnAccent, fontWeight: '900' },
  buttonDisabled: { opacity: 0.65 },
  errorTitle: { color: theme.colors.danger, fontSize: 20, fontWeight: '900' },
  mutedText: { color: theme.colors.textMuted, fontSize: 12 },
});
