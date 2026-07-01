import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard, Eyebrow, HeroTitle, BodyText } from '../components/ui-shell';
import { UiButton } from '../components/ui-button';
import { UiInput } from '../components/ui-input';
import { Text } from '../components/i18n-text';
import { TextInput } from '../components/i18n-text-input';
import { useI18n } from '../components/i18n';
import { createThemedStyles, useAppTheme } from '../components/theme';
import { apiClient } from '../services/api';

type SupportCategory = 'account' | 'technical' | 'ai_result' | 'health_data' | 'billing' | 'feedback' | 'other';
type SupportRequest = {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_reply?: string | null;
  created_at: string;
};

const CATEGORY_KEYS: Array<{ key: SupportCategory; icon: React.ComponentProps<typeof MaterialIcons>['name'] }> = [
  { key: 'technical', icon: 'build' },
  { key: 'account', icon: 'person-outline' },
  { key: 'ai_result', icon: 'psychology' },
  { key: 'health_data', icon: 'favorite-border' },
  { key: 'billing', icon: 'payments' },
  { key: 'feedback', icon: 'lightbulb-outline' },
  { key: 'other', icon: 'more-horiz' },
];

function statusTone(status: SupportRequest['status']) {
  if (status === 'resolved' || status === 'closed') return 'success';
  if (status === 'in_progress') return 'info';
  return 'warning';
}

export default function HelpScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [systemOnline, setSystemOnline] = useState<boolean | null>(null);
  const [formExpanded, setFormExpanded] = useState(false);
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(false);

  const faqs = useMemo(() => locale === 'vi' ? [
    { id: 'scan', question: 'Kết quả quét món ăn chưa chính xác thì làm gì?', answer: 'Mở kết quả quét, chỉnh tên món hoặc khẩu phần trước khi lưu. Những chỉnh sửa này giúp nhật ký chính xác hơn và được dùng làm tín hiệu cải thiện gợi ý.' },
    { id: 'target', question: 'Vì sao mục tiêu calo thay đổi?', answer: 'Mục tiêu có thể được tính lại khi hồ sơ, cân nặng hoặc mức vận động thay đổi. Màn Tiến trình hiển thị lý do và bản xem trước trước khi áp dụng điều chỉnh tuần.' },
    { id: 'sync', question: 'Tại sao dữ liệu sức khỏe chưa đồng bộ?', answer: 'Kiểm tra quyền HealthKit hoặc Health Connect, trạng thái gói và ngày đang chọn. Tính năng đồng bộ native không hoạt động trong Expo Go.' },
    { id: 'billing', question: 'Đã thanh toán nhưng gói chưa kích hoạt?', answer: 'Mở Quản lý gói và chọn Kiểm tra trạng thái. Nếu PayOS đã trừ tiền nhưng gói vẫn chưa hoạt động, gửi yêu cầu ở mục Thanh toán kèm mã đơn.' },
    { id: 'privacy', question: 'Tôi có thể tải hoặc xóa dữ liệu không?', answer: 'Có. Vào Hồ sơ → Quyền riêng tư & dữ liệu để tải bản sao JSON hoặc xóa vĩnh viễn tài khoản sau khi xác thực mật khẩu.' },
    { id: 'security', question: 'Calorie AI lưu ảnh món ăn như thế nào?', answer: 'Backend loại bỏ metadata ảnh trước khi xử lý. Telemetry không lưu URL ảnh gốc; dữ liệu nhạy cảm được giới hạn theo mục đích vận hành tính năng.' },
  ] : [
    { id: 'scan', question: 'What if a food scan is inaccurate?', answer: 'Edit the food name or portion before saving. Corrections improve your log and provide signals that help improve suggestions.' },
    { id: 'target', question: 'Why did my calorie target change?', answer: 'Targets may be recalculated when your profile, weight, or activity changes. Progress shows the rationale and weekly preview before an adjustment is applied.' },
    { id: 'sync', question: 'Why is health data not syncing?', answer: 'Check HealthKit or Health Connect permission, plan access, and the selected date. Native health sync does not work in Expo Go.' },
    { id: 'billing', question: 'I paid but my plan is not active', answer: 'Open Plan management and check status. If PayOS charged you but access is still missing, submit a Billing request with the order code.' },
    { id: 'privacy', question: 'Can I download or delete my data?', answer: 'Yes. Go to Profile → Privacy & data to export a JSON copy or permanently delete the account after password verification.' },
    { id: 'security', question: 'How are food images handled?', answer: 'The backend strips image metadata before processing. Telemetry does not store original image URLs, and sensitive data is limited to feature operation.' },
  ], [locale]);

  const filteredFaqs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    if (!query) return faqs;
    return faqs.filter((item) => `${item.question} ${item.answer}`.toLocaleLowerCase(locale).includes(query));
  }, [faqs, locale, search]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(false);
    try {
      const response = await apiClient.get('/support/requests');
      setRequests(response.data?.requests ?? []);
    } catch {
      setRequests([]);
      setRequestsError(true);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    apiClient.get('/health')
      .then((response) => setSystemOnline(response.data?.status === 'healthy'))
      .catch(() => setSystemOnline(false));
  }, [loadRequests]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile' as never);
  };

  const submitRequest = async () => {
    if (subject.trim().length < 3 || message.trim().length < 10 || submitting) return;
    setSubmitting(true);
    setFormStatus(null);
    try {
      await apiClient.post('/support/requests', {
        category,
        subject: subject.trim(),
        message: message.trim(),
        app_version: Constants.expoConfig?.version ?? '1.0.0',
        platform: Platform.OS,
      });
      setSubject('');
      setMessage('');
      setFormStatus({ tone: 'success', text: t('help.form.success') });
      await loadRequests();
    } catch (error: any) {
      const serverMessage = error?.response?.data?.message;
      setFormStatus({
        tone: 'error',
        text: typeof serverMessage === 'string' ? serverMessage : t('help.form.failed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell reserveBottomNav={false}>
      <TouchableOpacity style={styles.backLink} onPress={goBack} accessibilityRole="button">
        <MaterialIcons name="arrow-back" size={19} color={colors.textSoft} />
        <Text style={styles.backText} i18nKey="common.goBack" />
      </TouchableOpacity>

      <Eyebrow>help.eyebrow</Eyebrow>
      <HeroTitle>help.title</HeroTitle>
      <BodyText style={styles.heroBody}>help.body</BodyText>

      <View style={styles.statusStrip}>
        <View style={[styles.statusDot, { backgroundColor: systemOnline === false ? colors.danger : systemOnline === true ? colors.success : colors.textMuted }]} />
        <Text style={styles.statusText}>
          {systemOnline === null ? t('help.status.checking') : systemOnline ? t('help.status.online') : t('help.status.degraded')}
        </Text>
        <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? '1.0.0'} · {Platform.OS}</Text>
      </View>

      <Text style={styles.sectionEyebrow} i18nKey="help.quick.eyebrow" />
      <Text style={styles.sectionTitle} i18nKey="help.quick.title" />
      <View style={styles.quickGrid}>
        {[
          { icon: 'monitor-heart', label: t('help.quick.health'), route: '/health-sync' },
          { icon: 'payments', label: t('help.quick.billing'), route: '/paywall' },
          { icon: 'privacy-tip', label: t('help.quick.privacy'), route: '/privacy-data' },
          { icon: 'notifications-none', label: t('help.quick.notifications'), route: '/notifications' },
        ].map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.quickAction}
            onPress={() => router.push(item.route as never)}
            accessibilityRole="button"
          >
            <MaterialIcons name={item.icon as any} size={21} color={colors.accentCyan} />
            <Text style={styles.quickLabel}>{item.label}</Text>
            <MaterialIcons name="arrow-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionEyebrow} i18nKey="help.faq.eyebrow" />
      <Text style={styles.sectionTitle} i18nKey="help.faq.title" />
      <UiInput
        value={search}
        onChangeText={setSearch}
        placeholder="help.faq.search"
        accessibilityLabel={t('help.faq.search')}
        containerStyle={styles.searchInput}
      />
      <View style={styles.faqList}>
        {filteredFaqs.map((faq) => {
          const expanded = expandedFaq === faq.id;
          return (
            <SurfaceCard key={faq.id} style={styles.faqCard}>
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => setExpandedFaq(expanded ? null : faq.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <MaterialIcons name={expanded ? 'remove' : 'add'} size={21} color={colors.accentCyan} />
              </TouchableOpacity>
              {expanded ? <Text style={styles.faqAnswer}>{faq.answer}</Text> : null}
            </SurfaceCard>
          );
        })}
        {filteredFaqs.length === 0 ? (
          <SurfaceCard style={styles.emptyCard}>
            <MaterialIcons name="search-off" size={25} color={colors.textMuted} />
            <Text style={styles.emptyText} i18nKey="help.faq.empty" />
          </SurfaceCard>
        ) : null}
      </View>

      <SurfaceCard style={styles.contactCard}>
        <TouchableOpacity
          style={styles.contactHeader}
          onPress={() => {
            setFormExpanded((value) => !value);
            setFormStatus(null);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: formExpanded }}
        >
          <View style={styles.contactIcon}>
            <MaterialIcons name="forum" size={22} color={colors.accentCyan} />
          </View>
          <View style={styles.contactCopy}>
            <Text style={styles.contactTitle} i18nKey="help.form.title" />
            <Text style={styles.contactBody} i18nKey="help.form.body" />
          </View>
          <MaterialIcons name={formExpanded ? 'expand-less' : 'expand-more'} size={24} color={colors.textMuted} />
        </TouchableOpacity>

        {formExpanded ? (
          <View style={styles.form}>
            <Text style={styles.fieldLabel} i18nKey="help.form.category" />
            <View style={styles.categoryRow}>
              {CATEGORY_KEYS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.categoryChip, category === item.key && styles.categoryChipActive]}
                  onPress={() => setCategory(item.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === item.key }}
                >
                  <MaterialIcons name={item.icon} size={14} color={category === item.key ? colors.success : colors.textMuted} />
                  <Text style={[styles.categoryLabel, category === item.key && styles.categoryLabelActive]}>
                    {t(`help.category.${item.key}` as any)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <UiInput
              label="help.form.subject"
              value={subject}
              onChangeText={setSubject}
              placeholder="help.form.subjectPlaceholder"
              maxLength={160}
              error={subject.length > 0 && subject.trim().length < 3 ? t('help.form.subjectError') : undefined}
            />
            <Text style={styles.fieldLabel} i18nKey="help.form.message" />
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder="help.form.messagePlaceholder"
              placeholderTextColor={colors.textMuted}
              maxLength={2000}
              multiline
            />
            <Text style={styles.counter}>{message.length}/2000</Text>
            {formStatus ? (
              <Text style={[styles.formStatus, { color: formStatus.tone === 'error' ? colors.danger : colors.success }]}>
                {formStatus.text}
              </Text>
            ) : null}
            <UiButton
              label={submitting ? 'help.form.sending' : 'help.form.submit'}
              onPress={submitRequest}
              loading={submitting}
              disabled={subject.trim().length < 3 || message.trim().length < 10}
              style={styles.submitButton}
            />
          </View>
        ) : null}
      </SurfaceCard>

      <View style={styles.historyHeading}>
        <View>
          <Text style={styles.sectionEyebrow} i18nKey="help.history.eyebrow" />
          <Text style={styles.historyTitle} i18nKey="help.history.title" />
        </View>
        <TouchableOpacity onPress={loadRequests} style={styles.refreshAction} accessibilityRole="button">
          <MaterialIcons name="refresh" size={18} color={colors.accentCyan} />
        </TouchableOpacity>
      </View>

      {requestsLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.accentMint} />
        </View>
      ) : requestsError ? (
        <SurfaceCard style={styles.emptyCard}>
          <Text style={styles.errorText} i18nKey="help.history.failed" />
          <UiButton label="common.retry" onPress={loadRequests} style={styles.retryButton} />
        </SurfaceCard>
      ) : requests.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <MaterialIcons name="mark-chat-unread" size={25} color={colors.textMuted} />
          <Text style={styles.emptyText} i18nKey="help.history.empty" />
        </SurfaceCard>
      ) : requests.map((request) => {
        const tone = statusTone(request.status);
        const toneColor = tone === 'success' ? colors.success : tone === 'info' ? colors.info : colors.warning;
        return (
          <SurfaceCard key={request.id} style={styles.requestCard}>
            <View style={styles.requestHeader}>
              <View style={styles.requestCopy}>
                <Text style={styles.requestSubject}>{request.subject}</Text>
                <Text style={styles.requestMeta}>
                  {new Date(request.created_at).toLocaleDateString(locale)} · {t(`help.category.${request.category}` as any)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${toneColor}18` }]}>
                <Text style={[styles.statusBadgeText, { color: toneColor }]}>
                  {t(`help.status.${request.status}` as any)}
                </Text>
              </View>
            </View>
            {request.admin_reply ? (
              <View style={styles.replyBox}>
                <Text style={styles.replyLabel} i18nKey="help.history.reply" />
                <Text style={styles.replyText}>{request.admin_reply}</Text>
              </View>
            ) : null}
          </SurfaceCard>
        );
      })}
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  backLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  backText: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  heroBody: { maxWidth: 680, marginBottom: 16 },
  statusStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 26, paddingHorizontal: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.textSoft, fontSize: 11, fontWeight: '800' },
  versionText: { color: colors.textMuted, fontSize: 11, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  sectionEyebrow: { color: colors.accentCyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  sectionTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '900', letterSpacing: -0.4, marginTop: 4, marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 27 },
  quickAction: { flexGrow: 1, flexBasis: 150, minWidth: 140, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radii.lg, backgroundColor: colors.surfaceInfo, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.borderInfo },
  quickLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' },
  searchInput: { marginBottom: 4 },
  faqList: { gap: 9, marginBottom: 18 },
  faqCard: { paddingVertical: 13, borderColor: colors.borderSubtle },
  faqHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 12 },
  faqQuestion: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '900' },
  faqAnswer: { color: colors.textSoft, fontSize: 12, lineHeight: 19, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.borderSubtle, marginTop: 10 },
  emptyCard: { alignItems: 'center', gap: 9, backgroundColor: colors.surfaceAlt, marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  contactCard: { marginBottom: 24, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo },
  contactHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  contactCopy: { flex: 1 },
  contactTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 3 },
  contactBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  form: { borderTopWidth: 1, borderTopColor: colors.borderInfo, marginTop: 16, paddingTop: 16 },
  fieldLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  categoryChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 9 },
  categoryChipActive: { borderColor: colors.borderSuccess, backgroundColor: colors.surfaceSuccess },
  categoryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  categoryLabelActive: { color: colors.success },
  messageInput: { minHeight: 116, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, color: colors.text, fontSize: 14, lineHeight: 20, padding: 13, textAlignVertical: 'top' },
  counter: { color: colors.textMuted, fontSize: 10, textAlign: 'right', marginTop: 4 },
  formStatus: { fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 10 },
  submitButton: { marginTop: 13 },
  historyHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  historyTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginTop: 3 },
  refreshAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loadingCard: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  retryButton: { marginTop: 4, alignSelf: 'stretch' },
  requestCard: { marginBottom: 9, borderColor: colors.borderSubtle },
  requestHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  requestCopy: { flex: 1 },
  requestSubject: { color: colors.text, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  requestMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusBadgeText: { fontSize: 10, fontWeight: '900' },
  replyBox: { backgroundColor: colors.surfaceSuccess, borderRadius: 10, padding: 10, marginTop: 12 },
  replyLabel: { color: colors.success, fontSize: 10, fontWeight: '900', marginBottom: 4 },
  replyText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
}));
