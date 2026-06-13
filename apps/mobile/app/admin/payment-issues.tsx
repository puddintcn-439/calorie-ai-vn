import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/i18n-text';
import { theme } from '../../components/theme';
import {
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminStatusBadge,
  adminStyles,
} from '../../components/admin/AdminShell';
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

function badgeTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'resolved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'in_review') return 'info';
  if (status === 'open') return 'warning';
  return 'neutral';
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
    <AdminSectionCard style={styles.issueCard}>
      <View style={styles.issueHeader}>
        <View style={styles.issueIdentity}>
          <Text style={styles.issueTitle}>{issue.issue_type ?? 'payment_issue'}</Text>
          <Text style={adminStyles.muted}>{issue.user_email ?? issue.user_id ?? 'Unknown user'}</Text>
        </View>
        <AdminStatusBadge label={issue.status || 'open'} tone={badgeTone(issue.status)} />
      </View>

      <View style={adminStyles.grid}>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Provider</Text><Text style={adminStyles.keyValue}>{issue.provider ?? '--'}</Text></View>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Order</Text><Text style={adminStyles.keyValue}>{orderCode}</Text></View>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Amount</Text><Text style={adminStyles.keyValue}>{formatVnd(invoice.amount_vnd)}</Text></View>
        <View style={adminStyles.keyBox}><Text style={adminStyles.keyLabel}>Created</Text><Text style={adminStyles.keyValue}>{formatDate(issue.created_at)}</Text></View>
      </View>

      {issue.user_message ? (
        <View style={styles.userMessageBox}>
          <Text style={styles.userMessageLabel}>User message</Text>
          <Text style={styles.userMessage}>{issue.user_message}</Text>
        </View>
      ) : null}

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

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>admin_note · internal only</Text>
        <TextInput
          value={adminNote}
          onChangeText={setAdminNote}
          placeholder="Internal note for support/admin team. Not visible to user."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={2000}
          style={styles.input}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>resolution · user-facing</Text>
        <TextInput
          value={resolution}
          onChangeText={setResolution}
          placeholder="Resolution message the user can see in notifications/support history."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={2000}
          style={styles.input}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[adminStyles.primaryButton, saving && styles.buttonDisabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={adminStyles.primaryButtonText}>{saving ? 'Saving...' : 'Save update'}</Text>
      </TouchableOpacity>
      {message ? <Text style={adminStyles.muted}>{message}</Text> : null}
    </AdminSectionCard>
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
    <AdminShell
      title="Payment Issues"
      subtitle="Xử lý yêu cầu hoàn tiền, thanh toán trùng hoặc chưa kích hoạt gói."
      onRefresh={load}
    >
      <AdminSectionCard title="Support queue" subtitle="Resolution là nội dung user thấy. Admin note chỉ dùng nội bộ và không nên chứa dữ liệu nhạy cảm.">
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
      </AdminSectionCard>

      {loading ? (
        <AdminStateCard state="loading" title="Loading..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : response && response.issues.length > 0 ? (
        <View style={styles.content}>
          <Text style={adminStyles.muted}>{response.total} payment issue case(s)</Text>
          {response.issues.map((issue) => <IssueCard key={issue.id} issue={issue} onUpdated={load} />)}
        </View>
      ) : (
        <AdminStateCard state="empty" title="No payment issues" body="Không có case nào theo filter hiện tại." />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  issueCard: { gap: 12 },
  issueHeader: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' },
  issueIdentity: { flex: 1, gap: 4 },
  issueTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '900' },
  userMessageBox: { borderRadius: 8, backgroundColor: theme.colors.surfaceAlt, padding: 12, gap: 4 },
  userMessageLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  userMessage: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 8 },
  statusButtonActive: { backgroundColor: theme.colors.accentMint, borderColor: theme.colors.accentMint },
  statusButtonText: { color: theme.colors.text, fontSize: 12, fontWeight: '800' },
  statusButtonTextActive: { color: theme.colors.textOnAccent },
  inputGroup: { gap: 6 },
  inputLabel: { color: theme.colors.textSoft, fontSize: 12, fontWeight: '900' },
  input: { minHeight: 74, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.borderSubtle, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20 },
  buttonDisabled: { opacity: 0.65 },
});
