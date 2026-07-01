import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../components/i18n-text';
import { useAppTheme } from '../../components/theme';
import {
  AdminChip,
  AdminSectionCard,
  AdminShell,
  AdminStateCard,
  AdminStatusBadge,
  AdminTone,
  adminChrome,
  adminStyles,
  adminTones,
} from '../../components/admin/AdminShell';
import {
  adminService,
  AdminSupportRequest,
  AdminSupportRequestsResponse,
} from '../../services/admin.service';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const CATEGORIES = ['account', 'technical', 'ai_result', 'health_data', 'billing', 'feedback', 'other'] as const;

function statusTone(status: string): AdminTone {
  if (status === 'resolved' || status === 'closed') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'open') return 'warning';
  return 'neutral';
}

function categoryTone(category: string): AdminTone {
  if (category === 'billing') return 'billing';
  if (category === 'ai_result') return 'ai';
  if (category === 'health_data') return 'success';
  if (category === 'technical') return 'danger';
  return 'support';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
}

function TicketCard({
  request,
  onUpdated,
  placeholderColor,
}: {
  request: AdminSupportRequest;
  onUpdated: () => void;
  placeholderColor: string;
}) {
  const [status, setStatus] = useState<AdminSupportRequest['status']>(request.status);
  const [reply, setReply] = useState(request.admin_reply ?? '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      await adminService.updateSupportRequest(request.id, {
        status,
        admin_reply: reply.trim() || undefined,
      });
      setResult({ tone: 'success', text: 'Saved, audited, and user notified.' });
      await onUpdated();
    } catch (error: any) {
      setResult({
        tone: 'error',
        text: error?.response?.data?.message ?? 'Could not update this request.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSectionCard style={styles.ticketCard}>
      <View style={styles.ticketHeader}>
        <View style={styles.ticketIdentity}>
          <View style={styles.ticketTitleRow}>
            <Text style={styles.ticketTitle}>{request.subject}</Text>
            <AdminChip label={request.category} tone={categoryTone(request.category)} active />
          </View>
          <TouchableOpacity onPress={() => router.push(`/admin/users/${request.user_id}` as any)}>
            <Text style={styles.userLink}>{request.user_email ?? request.user_id}</Text>
          </TouchableOpacity>
        </View>
        <AdminStatusBadge label={request.status} tone={statusTone(request.status)} />
      </View>

      <View style={styles.metaGrid}>
        <View style={adminStyles.keyBox}>
          <Text style={adminStyles.keyLabel}>Created</Text>
          <Text style={adminStyles.keyValue}>{formatDate(request.created_at)}</Text>
        </View>
        <View style={adminStyles.keyBox}>
          <Text style={adminStyles.keyLabel}>Client</Text>
          <Text style={adminStyles.keyValue}>{request.platform ?? '--'} · {request.app_version ?? '--'}</Text>
        </View>
      </View>

      <View style={styles.messageBox}>
        <Text style={styles.messageLabel}>User message</Text>
        <Text style={styles.messageText}>{request.message}</Text>
      </View>

      <View style={styles.statusRow}>
        {STATUSES.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.filterButton, status === option && styles.filterButtonActive]}
            onPress={() => setStatus(option)}
          >
            <Text style={[styles.filterText, status === option && styles.filterTextActive]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.replyGroup}>
        <View style={styles.replyHeading}>
          <Text style={styles.replyLabel}>Reply visible to user</Text>
          <AdminChip label="Notification + Help history" tone="support" active />
        </View>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder="Write a clear answer or next step. Do not include secrets or internal notes."
          placeholderTextColor={placeholderColor}
          multiline
          maxLength={2000}
          style={styles.replyInput}
          textAlignVertical="top"
        />
        <Text style={styles.counter}>{reply.length}/2000</Text>
      </View>

      <TouchableOpacity
        style={[adminStyles.primaryButton, saving && styles.disabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={adminStyles.primaryButtonText}>{saving ? 'Saving...' : 'Save and notify user'}</Text>
      </TouchableOpacity>
      {result ? (
        <Text style={{ color: result.tone === 'error' ? adminChrome.rose : adminChrome.mint, fontSize: 12, fontWeight: '800' }}>
          {result.text}
        </Text>
      ) : null}
    </AdminSectionCard>
  );
}

function QueueSummary({ requests }: { requests: AdminSupportRequest[] }) {
  return (
    <View style={styles.summaryGrid}>
      {STATUSES.map((status) => {
        const tone = adminTones[statusTone(status)];
        const count = requests.filter((request) => request.status === status).length;
        return (
          <View key={status} style={[styles.summaryBox, { backgroundColor: tone.soft, borderColor: tone.border }]}>
            <Text style={styles.summaryValue}>{count}</Text>
            <Text style={[styles.summaryLabel, { color: tone.text }]}>{status}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AdminSupportRequestsScreen() {
  const { colors } = useAppTheme();
  const [response, setResponse] = useState<AdminSupportRequestsResponse | null>(null);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await adminService.fetchSupportRequests({
        status: status || undefined,
        category: category || undefined,
        search: search || undefined,
      }));
    } catch (err: any) {
      const code = Number(err?.response?.status ?? 0);
      setResponse(null);
      setError(code === 403 ? 'Support role is required.' : code === 401 ? 'Admin session expired.' : 'Could not load Help Inbox.');
    } finally {
      setLoading(false);
    }
  }, [category, search, status]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  return (
    <AdminShell
      title="Help Inbox"
      subtitle="Phân loại, phản hồi và theo dõi yêu cầu hỗ trợ chung từ người dùng."
      onRefresh={load}
    >
      <AdminSectionCard title="Queue filters" subtitle="Support trở lên mới có quyền đọc và phản hồi ticket. Mọi cập nhật đều được audit.">
        {response ? <QueueSummary requests={response.requests} /> : null}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.statusRow}>
            {['', ...STATUSES].map((option) => (
              <TouchableOpacity
                key={option || 'all-status'}
                style={[styles.filterButton, status === option && styles.filterButtonActive]}
                onPress={() => setStatus(option)}
              >
                <Text style={[styles.filterText, status === option && styles.filterTextActive]}>{option || 'all'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Category</Text>
          <View style={styles.statusRow}>
            {['', ...CATEGORIES].map((option) => (
              <TouchableOpacity
                key={option || 'all-category'}
                style={[styles.filterButton, category === option && styles.filterButtonActive]}
                onPress={() => setCategory(option)}
              >
                <Text style={[styles.filterText, category === option && styles.filterTextActive]}>{option || 'all'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search ticket subject"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            onSubmitEditing={() => setSearch(searchDraft.trim())}
          />
          <TouchableOpacity style={adminStyles.primaryButton} onPress={() => setSearch(searchDraft.trim())}>
            <Text style={adminStyles.primaryButtonText}>Search</Text>
          </TouchableOpacity>
        </View>
      </AdminSectionCard>

      {loading ? (
        <AdminStateCard state="loading" title="Loading Help Inbox..." />
      ) : error ? (
        <AdminStateCard state="denied" title={error} onRetry={load} showLogin />
      ) : response && response.requests.length > 0 ? (
        <View style={styles.content}>
          <Text style={adminStyles.muted}>{response.total} request(s) in the current view</Text>
          {response.requests.map((request) => (
            <TicketCard key={request.id} request={request} onUpdated={load} placeholderColor={colors.textMuted} />
          ))}
        </View>
      ) : (
        <AdminStateCard state="empty" title="Inbox is clear" body="Không có ticket nào theo bộ lọc hiện tại." />
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  ticketCard: { gap: 13 },
  ticketHeader: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketIdentity: { flex: 1, gap: 5 },
  ticketTitleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  ticketTitle: { color: adminChrome.text, fontSize: 17, lineHeight: 23, fontWeight: '900', flexShrink: 1 },
  userLink: { color: adminChrome.accent, fontSize: 12, fontWeight: '800' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  messageBox: { borderRadius: 10, backgroundColor: adminChrome.cardMuted, borderWidth: 1, borderColor: adminChrome.border, padding: 13, gap: 5 },
  messageLabel: { color: adminChrome.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  messageText: { color: adminChrome.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterButton: { borderRadius: 999, borderWidth: 1, borderColor: adminChrome.borderStrong, backgroundColor: adminChrome.cardBg, paddingHorizontal: 11, paddingVertical: 8 },
  filterButtonActive: { backgroundColor: adminChrome.accentSoft, borderColor: adminChrome.accent },
  filterText: { color: adminChrome.textSoft, fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: adminChrome.accent },
  replyGroup: { gap: 6 },
  replyHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  replyLabel: { color: adminChrome.textSoft, fontSize: 12, fontWeight: '900' },
  replyInput: { minHeight: 90, borderRadius: 10, borderWidth: 1, borderColor: adminChrome.borderStrong, color: adminChrome.text, backgroundColor: adminChrome.cardBg, padding: 12, fontSize: 14, lineHeight: 20 },
  counter: { color: adminChrome.textMuted, fontSize: 10, textAlign: 'right' },
  disabled: { opacity: 0.6 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryBox: { flexGrow: 1, flexBasis: 140, minWidth: 120, borderRadius: 10, borderWidth: 1, padding: 12, gap: 3 },
  summaryValue: { color: adminChrome.text, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '800' },
  filterGroup: { gap: 7, marginTop: 12 },
  filterLabel: { color: adminChrome.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  searchRow: { flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 13 },
  searchInput: { flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: adminChrome.borderStrong, color: adminChrome.text, backgroundColor: adminChrome.cardBg, paddingHorizontal: 12, fontSize: 13 },
});
