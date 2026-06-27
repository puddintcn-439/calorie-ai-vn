import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../i18n-text';
import { useI18n } from '../i18n';
import { SurfaceCard } from '../ui-shell';
import { createThemedStyles, useAppTheme } from '../theme';
import { TodayCoachSuggestion } from '../../hooks/useTodayCoach';

type Props = {
  suggestions: TodayCoachSuggestion[];
  motivation: string;
  updatedAt: string;
  onPress: (suggestion: TodayCoachSuggestion) => void;
};

export function TodayCoachCard({ suggestions, motivation, updatedAt, onPress }: Props) {
  const { colors } = useAppTheme();
  const { t } = useI18n();

  return (
    <SurfaceCard revealDelay={70} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.aiMark, { backgroundColor: colors.surfaceSuccess }]}>
            <Ionicons name="sparkles" size={14} color={colors.accentLeaf} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>AI Coach</Text>
        </View>
        <Text style={[styles.updatedAt, { color: colors.textMuted }]}>{updatedAt}</Text>
      </View>

      <View style={[styles.suggestionList, { backgroundColor: colors.surfaceMuted }]}>
        {suggestions.map((suggestion, index) => (
          <React.Fragment key={`${suggestion.type}-${index}`}>
            <SuggestionRow
              suggestion={suggestion}
              primary={index === 0}
              actionLabel={t('screen.tabs.index.aiCoach.primaryAction' as any)}
              onPress={() => onPress(suggestion)}
            />
            {index < suggestions.length - 1 && (
              <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={[styles.motivation, { backgroundColor: colors.surfaceSuccess }]}>
        <Ionicons name="sparkles" size={14} color={colors.accentLeaf} />
        <Text style={[styles.motivationText, { color: colors.success }]}>{motivation}</Text>
      </View>
    </SurfaceCard>
  );
}

function SuggestionRow({
  suggestion,
  primary,
  actionLabel,
  onPress,
}: {
  suggestion: TodayCoachSuggestion;
  primary: boolean;
  actionLabel: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const tone = {
    nutrition: { background: colors.surfaceSuccess, foreground: colors.success },
    calories: { background: colors.surfaceWarning, foreground: colors.accentAmber },
    movement: { background: colors.surfaceInfo, foreground: colors.info },
    success: { background: colors.surfaceSuccess, foreground: colors.success },
  }[suggestion.tone];

  const content = (
    <>
      <View style={[styles.suggestionIcon, { backgroundColor: tone.background }]}>
        <Ionicons name={suggestion.icon} size={22} color={tone.foreground} />
      </View>
      <View style={styles.suggestionCopy}>
        <Text style={[styles.suggestionTitle, { color: colors.text }]}>{suggestion.title}</Text>
        <Text style={[styles.suggestionDetail, { color: colors.textMuted }]} numberOfLines={2}>
          {suggestion.detail}
        </Text>
      </View>
      {suggestion.value && (
        <Text style={[styles.suggestionValue, { color: tone.foreground }]}>{suggestion.value}</Text>
      )}
      {primary && (
        <View style={[styles.primaryAction, { backgroundColor: tone.foreground }]}>
          <Text style={[styles.primaryActionText, { color: colors.surface }]}>{actionLabel}</Text>
        </View>
      )}
    </>
  );

  return primary ? (
    <TouchableOpacity
      style={styles.suggestionRow}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={suggestion.title}
    >
      {content}
    </TouchableOpacity>
  ) : (
    <View style={styles.suggestionRow}>{content}</View>
  );
}

const styles = createThemedStyles(() => ({
  card: { borderRadius: 22, padding: 12, marginBottom: 13 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginBottom: 10,
  },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  aiMark: { width: 28, height: 28, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { fontSize: 14, fontWeight: '900' as const, letterSpacing: -0.2 },
  updatedAt: { fontSize: 10.5, fontWeight: '600' as const },
  suggestionList: { borderRadius: 17, paddingHorizontal: 12 },
  suggestionRow: {
    minHeight: 66,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    paddingVertical: 8,
  },
  suggestionIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionTitle: { fontSize: 12.5, lineHeight: 17, fontWeight: '800' as const },
  suggestionDetail: { fontSize: 11, lineHeight: 15.5, fontWeight: '500' as const, marginTop: 2 },
  suggestionValue: { fontSize: 11.5, fontWeight: '900' as const, fontVariant: ['tabular-nums'] as any },
  primaryAction: { minHeight: 30, borderRadius: 10, paddingHorizontal: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  primaryActionText: { fontSize: 10.5, fontWeight: '900' as const },
  divider: { height: 1, marginLeft: 55 },
  motivation: {
    minHeight: 42,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 9,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  motivationText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontWeight: '700' as const },
}));
