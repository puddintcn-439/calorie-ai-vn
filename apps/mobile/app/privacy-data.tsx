import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  BodyText,
  Eyebrow,
  HeroTitle,
  ScreenShell,
  SurfaceCard,
} from '../components/ui-shell';
import { UiButton } from '../components/ui-button';
import { Text } from '../components/i18n-text';
import { TextInput } from '../components/i18n-text-input';
import { useI18n } from '../components/i18n';
import { createThemedStyles, useAppTheme } from '../components/theme';
import { apiClient } from '../services/api';
import { useAuthStore } from '../store/auth.store';

const DELETE_PHRASE = 'XÓA TÀI KHOẢN';

function PrivacyRow({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  body: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.privacyRow}>
      <View style={styles.rowIcon}>
        <MaterialIcons name={icon} size={18} color={colors.accentCyan} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

function errorMessage(error: any, fallback: string) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export default function PrivacyDataScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const logout = useAuthStore((state) => state.logout);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile' as never);
  };

  const downloadExport = async () => {
    setExporting(true);
    setExportStatus(null);
    try {
      const response = await apiClient.get('/privacy/export');
      const json = JSON.stringify(response.data, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `calorie-ai-data-${date}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        if (Platform.OS === 'android') {
          const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permission.granted) {
            setExportStatus({ tone: 'error', text: t('privacy.export.cancelled') });
            return;
          }
          const uri = await FileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            filename,
            'application/json',
          );
          await FileSystem.writeAsStringAsync(uri, json);
        } else {
          const uri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(uri, json);
        }
      }

      setExportStatus({ tone: 'success', text: t('privacy.export.success') });
    } catch (error) {
      setExportStatus({
        tone: 'error',
        text: errorMessage(error, t('privacy.export.failed')),
      });
    } finally {
      setExporting(false);
    }
  };

  const deleteReady = password.length >= 6 && confirmation.trim() === DELETE_PHRASE;

  const handleDeleteAccount = async () => {
    if (!deleteReady || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete('/privacy/account', {
        data: { password, confirmation: 'DELETE' },
      });
      await logout();
      router.replace('/(auth)/login' as never);
    } catch (error) {
      setDeleteError(errorMessage(error, t('privacy.delete.failed')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScreenShell reserveBottomNav={false}>
      <TouchableOpacity
        style={styles.backLink}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
      >
        <MaterialIcons name="arrow-back" size={19} color={colors.textSoft} />
        <Text style={styles.backText} i18nKey="common.goBack" />
      </TouchableOpacity>

      <Eyebrow>privacy.eyebrow</Eyebrow>
      <HeroTitle>privacy.title</HeroTitle>
      <BodyText style={styles.heroBody}>privacy.body</BodyText>

      <SurfaceCard style={styles.promiseCard}>
        <View style={styles.promiseIcon}>
          <MaterialIcons name="verified-user" size={24} color={colors.success} />
        </View>
        <View style={styles.promiseCopy}>
          <Text style={styles.promiseTitle} i18nKey="privacy.promise.title" />
          <Text style={styles.promiseBody} i18nKey="privacy.promise.body" />
        </View>
      </SurfaceCard>

      <Text style={styles.sectionEyebrow} i18nKey="privacy.data.eyebrow" />
      <Text style={styles.sectionTitle} i18nKey="privacy.data.title" />
      <SurfaceCard style={styles.dataCard}>
        <PrivacyRow
          icon="person-outline"
          title={t('privacy.data.profile.title')}
          body={t('privacy.data.profile.body')}
        />
        <View style={styles.rowDivider} />
        <PrivacyRow
          icon="restaurant-menu"
          title={t('privacy.data.health.title')}
          body={t('privacy.data.health.body')}
        />
        <View style={styles.rowDivider} />
        <PrivacyRow
          icon="psychology"
          title={t('privacy.data.ai.title')}
          body={t('privacy.data.ai.body')}
        />
        <View style={styles.rowDivider} />
        <PrivacyRow
          icon="payments"
          title={t('privacy.data.billing.title')}
          body={t('privacy.data.billing.body')}
        />
      </SurfaceCard>

      <SurfaceCard style={styles.exportCard}>
        <View style={styles.actionHeader}>
          <View style={styles.actionIcon}>
            <MaterialIcons name="file-download" size={21} color={colors.accentCyan} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle} i18nKey="privacy.export.title" />
            <Text style={styles.actionBody} i18nKey="privacy.export.body" />
          </View>
        </View>
        <UiButton
          label={exporting ? 'privacy.export.loading' : 'privacy.export.action'}
          onPress={downloadExport}
          loading={exporting}
          style={styles.actionButton}
        />
        {exportStatus ? (
          <View style={[
            styles.inlineStatus,
            exportStatus.tone === 'error' ? styles.inlineStatusError : styles.inlineStatusSuccess,
          ]}>
            <MaterialIcons
              name={exportStatus.tone === 'error' ? 'error-outline' : 'check-circle-outline'}
              size={16}
              color={exportStatus.tone === 'error' ? colors.danger : colors.success}
            />
            <Text style={[
              styles.inlineStatusText,
              { color: exportStatus.tone === 'error' ? colors.danger : colors.success },
            ]}>
              {exportStatus.text}
            </Text>
          </View>
        ) : null}
      </SurfaceCard>

      <View style={styles.retentionNote}>
        <MaterialIcons name="schedule" size={19} color={colors.accentAmber} />
        <View style={styles.retentionCopy}>
          <Text style={styles.retentionTitle} i18nKey="privacy.retention.title" />
          <Text style={styles.retentionBody} i18nKey="privacy.retention.body" />
        </View>
      </View>

      <SurfaceCard style={styles.dangerCard}>
        <TouchableOpacity
          style={styles.dangerHeader}
          onPress={() => {
            setDeleteExpanded((value) => !value);
            setDeleteError(null);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: deleteExpanded }}
        >
          <View style={styles.dangerHeaderCopy}>
            <View style={styles.dangerIcon}>
              <MaterialIcons name="delete-forever" size={21} color={colors.danger} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.dangerTitle} i18nKey="privacy.delete.title" />
              <Text style={styles.actionBody} i18nKey="privacy.delete.body" />
            </View>
          </View>
          <MaterialIcons
            name={deleteExpanded ? 'expand-less' : 'expand-more'}
            size={24}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {deleteExpanded ? (
          <View style={styles.deleteForm}>
            <Text style={styles.deleteWarning} i18nKey="privacy.delete.warning" />
            <Text style={styles.fieldLabel} i18nKey="privacy.delete.password" />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="privacy.delete.passwordPlaceholder"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>
              {t('privacy.delete.confirmation', { phrase: DELETE_PHRASE })}
            </Text>
            <TextInput
              style={styles.input}
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              placeholder={DELETE_PHRASE}
              placeholderTextColor={colors.textMuted}
            />
            {deleteError ? (
              <Text style={styles.deleteError}>{deleteError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.deleteButton, !deleteReady && styles.deleteButtonDisabled]}
              onPress={handleDeleteAccount}
              disabled={!deleteReady || deleting}
              accessibilityRole="button"
              accessibilityState={{ disabled: !deleteReady || deleting }}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.textOnDanger} />
              ) : (
                <>
                  <MaterialIcons name="delete-forever" size={18} color={colors.textOnDanger} />
                  <Text style={styles.deleteButtonText} i18nKey="privacy.delete.action" />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </SurfaceCard>

      <Text style={styles.footerNote} i18nKey="privacy.footer" />
    </ScreenShell>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  backText: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  heroBody: { maxWidth: 680, marginBottom: 20 },
  promiseCard: {
    flexDirection: 'row',
    gap: 13,
    marginBottom: 26,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  promiseIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  promiseCopy: { flex: 1 },
  promiseTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 4 },
  promiseBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  sectionEyebrow: {
    color: colors.accentCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 4,
    marginBottom: 12,
  },
  dataCard: { marginBottom: 14, borderColor: colors.borderSubtle },
  privacyRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceInfo,
  },
  rowCopy: { flex: 1, paddingTop: 1 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 3 },
  rowBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  rowDivider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: 14, marginLeft: 48 },
  exportCard: { marginBottom: 14, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo },
  actionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 4 },
  actionBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  actionButton: { marginTop: 14 },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  inlineStatusSuccess: { backgroundColor: colors.surfaceSuccess },
  inlineStatusError: { backgroundColor: colors.surfaceDanger },
  inlineStatusText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  retentionNote: { flexDirection: 'row', gap: 11, paddingHorizontal: 4, paddingVertical: 12, marginBottom: 16 },
  retentionCopy: { flex: 1 },
  retentionTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 3 },
  retentionBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  dangerCard: { marginBottom: 18, borderColor: colors.borderDanger, backgroundColor: colors.surface },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dangerHeaderCopy: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dangerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDanger,
  },
  dangerTitle: { color: colors.danger, fontSize: 15, fontWeight: '900', marginBottom: 4 },
  deleteForm: { borderTopWidth: 1, borderTopColor: colors.borderDanger, marginTop: 16, paddingTop: 16 },
  deleteWarning: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  fieldLabel: { color: colors.textSoft, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  deleteError: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700', marginBottom: 12 },
  deleteButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonDisabled: { opacity: 0.42 },
  deleteButtonText: { color: colors.textOnDanger, fontSize: 13, fontWeight: '900' },
  footerNote: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginBottom: 24 },
}));
