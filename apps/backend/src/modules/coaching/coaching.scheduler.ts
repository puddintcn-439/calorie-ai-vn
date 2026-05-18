import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CoachingService } from './coaching.service';

/**
 * Runs daily to analyze behavioral patterns for active users
 * and generate personalized coaching insights
 */
@Injectable()
export class CoachingSchedulerService {
  private readonly logger = new Logger(CoachingSchedulerService.name);

  constructor(
    private supabase: SupabaseService,
    private coaching: CoachingService,
  ) {}

  /**
   * Every day at 6 AM: analyze patterns for users who logged food yesterday
   */
  @Cron('0 6 * * *') // 6:00 AM every day
  async analyzeDailyPatterns() {
    this.logger.log('⚡ Running daily coaching pattern analysis...');

    try {
      // Get users who logged food in the last 7 days (active users worth analyzing)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: activeUsers, error } = await this.supabase.db
        .from('food_logs')
        .select('user_id')
        .gte('logged_at', sevenDaysAgo.toISOString())
        .limit(1000);

      if (error || !activeUsers) {
        this.logger.warn('No active users found or query failed');
        return;
      }

      // Deduplicate user IDs
      const userIds = [...new Set(activeUsers.map((l: any) => l.user_id))];
      this.logger.log(`Analyzing patterns for ${userIds.length} active users`);

      let analyzed = 0;
      let insightsGenerated = 0;

      for (const userId of userIds) {
        try {
          const patterns = await this.coaching.analyzeWeeklyPatterns(userId);

          if (patterns.length === 0) continue;

          // Store patterns (upsert)
          for (const pattern of patterns) {
            await this.supabase.db.from('user_behavioral_patterns').upsert(
              {
                user_id: userId,
                pattern_type: pattern.pattern_type,
                severity_level: pattern.severity_level,
                frequency_score: pattern.frequency_score,
                last_detected_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,pattern_type' },
            );
          }

          // Generate & store insights (only high-severity, non-duplicated)
          const insights = await this.coaching.generateInsights(userId, patterns.filter(p => p.severity_level >= 3));
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          for (const insight of insights) {
            // Skip if the same insight content already exists and is not expired.
            let existingQuery = this.supabase.db
              .from('user_coaching_insights')
              .select('id')
              .eq('user_id', userId)
              .eq('title', insight.title)
              .eq('description', insight.description)
              .eq('is_acknowledged', false)
              .gt('expires_at', new Date().toISOString());

            existingQuery = insight.action_suggestion
              ? existingQuery.eq('action_suggestion', insight.action_suggestion)
              : existingQuery.is('action_suggestion', null);

            const { data: existing } = await existingQuery.maybeSingle();

            if (existing) continue;

            await this.supabase.db.from('user_coaching_insights').insert({
              user_id: userId,
              insight_type: insight.insight_type,
              title: insight.title,
              description: insight.description,
              action_suggestion: insight.action_suggestion,
              impact_score: insight.impact_score,
              created_at: new Date().toISOString(),
              expires_at: expiresAt,
            });

            insightsGenerated++;
          }

          analyzed++;
        } catch (err) {
          this.logger.warn(`Failed to analyze patterns for user ${userId}: ${err}`);
        }
      }

      this.logger.log(
        `✅ Pattern analysis done: ${analyzed} users analyzed, ${insightsGenerated} insights generated`,
      );
    } catch (err) {
      this.logger.error(`Pattern analysis job failed: ${err}`);
    }
  }

  /**
   * Every Sunday at midnight: clean up expired, acknowledged insights older than 30 days
   */
  @Cron('0 0 * * 0') // midnight on Sundays
  async cleanupOldInsights() {
    this.logger.log('🧹 Cleaning up old coaching insights...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { error } = await this.supabase.db
        .from('user_coaching_insights')
        .delete()
        .eq('is_acknowledged', true)
        .lt('acknowledged_at', thirtyDaysAgo.toISOString());

      if (error) {
        this.logger.warn(`Cleanup failed: ${error.message}`);
      } else {
        this.logger.log('✅ Old insights cleaned up');
      }
    } catch (err) {
      this.logger.error(`Cleanup job failed: ${err}`);
    }
  }
}
