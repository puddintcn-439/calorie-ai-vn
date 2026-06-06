import { Controller, Get, Post, Put, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CoachingService } from './coaching.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BehaviorMemory, CoachingInsight, CoachingSummary } from '@calorie-ai/types';

@ApiTags('Coaching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coaching')
export class CoachingController {
  constructor(
    private coaching: CoachingService,
    private supabase: SupabaseService,
  ) {}

  @Get('weekly-summary')
  @ApiOperation({ summary: 'Get current week coaching summary' })
  async getWeeklySummary(@Request() req: any): Promise<CoachingSummary | null> {
    const userId = req.user.id ?? req.user.sub;
    return this.coaching.generateWeeklySummary(userId);
  }

  @Get('behavior-memory')
  @ApiOperation({ summary: 'Get long-running behavior memory for coach personalization' })
  async getBehaviorMemory(@Request() req: any): Promise<BehaviorMemory> {
    const userId = req.user.id ?? req.user.sub;
    return this.coaching.getBehaviorMemory(userId);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Get all active coaching insights for user' })
  async getInsights(@Request() req: any): Promise<CoachingInsight[]> {
    const userId = req.user.id ?? req.user.sub;

    // Get non-expired, unacknowledged insights
    const { data: insights, error } = await this.supabase.db
      .from('user_coaching_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_acknowledged', false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Failed to fetch insights:', error);
      return [];
    }

    return this.coaching.dedupeInsights(insights || []);
  }

  @Post('insights/:insightId/acknowledge')
  @ApiOperation({ summary: 'Mark an insight as acknowledged by user' })
  async acknowledgeInsight(
    @Request() req: any,
    @Param('insightId') insightId: string,
  ): Promise<{ acknowledged: boolean }> {
    const userId = req.user.id ?? req.user.sub;

    const { data: targetInsight } = await this.supabase.db
      .from('user_coaching_insights')
      .select('title, description, action_suggestion')
      .eq('id', parseInt(insightId))
      .eq('user_id', userId)
      .maybeSingle();

    let updateQuery = this.supabase.db
      .from('user_coaching_insights')
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (targetInsight) {
      updateQuery = updateQuery
        .eq('title', targetInsight.title)
        .eq('description', targetInsight.description);

      updateQuery = targetInsight.action_suggestion
        ? updateQuery.eq('action_suggestion', targetInsight.action_suggestion)
        : updateQuery.is('action_suggestion', null);
    } else {
      updateQuery = updateQuery.eq('id', parseInt(insightId));
    }

    const { error } = await updateQuery;

    if (error) {
      console.error('Failed to acknowledge insight:', error);
      return { acknowledged: false };
    }

    return { acknowledged: true };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Trigger pattern analysis and insight generation (admin/debug)' })
  async triggerAnalysis(@Request() req: any): Promise<{ patterns: number; insights: number }> {
    const userId = req.user.id ?? req.user.sub;

    try {
      // Analyze patterns
      const patterns = await this.coaching.analyzeWeeklyPatterns(userId);

      // Generate insights
      const insights = await this.coaching.generateInsights(userId, patterns);

      // Store patterns
      for (const pattern of patterns) {
        const { error } = await this.supabase.db
          .from('user_behavioral_patterns')
          .upsert(
            {
              user_id: userId,
              pattern_type: pattern.pattern_type,
              severity_level: pattern.severity_level,
              frequency_score: pattern.frequency_score,
              last_detected_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,pattern_type' },
          );

        if (error) {
          console.error(`Failed to store pattern ${pattern.pattern_type}:`, error);
        }
      }

      // Store insights
      for (const insight of insights) {
        let existingQuery = this.supabase.db
          .from('user_coaching_insights')
          .select('id')
          .eq('user_id', userId)
          .eq('title', insight.title)
          .eq('description', insight.description)
          .eq('is_acknowledged', false);

        existingQuery = insight.action_suggestion
          ? existingQuery.eq('action_suggestion', insight.action_suggestion)
          : existingQuery.is('action_suggestion', null);

        const { data: existing } = await existingQuery.maybeSingle();
        if (existing) continue;

        const { error } = await this.supabase.db
          .from('user_coaching_insights')
          .insert({
            user_id: userId,
            insight_type: insight.insight_type,
            title: insight.title,
            description: insight.description,
            action_suggestion: insight.action_suggestion,
            impact_score: insight.impact_score,
            pattern_id: insight.pattern_id,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          });

        if (error) {
          console.error(`Failed to store insight:`, error);
        }
      }

      return {
        patterns: patterns.length,
        insights: insights.length,
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      return { patterns: 0, insights: 0 };
    }
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Get detected behavioral patterns' })
  async getPatterns(@Request() req: any) {
    const userId = req.user.id ?? req.user.sub;

    const { data: patterns, error } = await this.supabase.db
      .from('user_behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('severity_level', { ascending: false });

    if (error) {
      console.error('Failed to fetch patterns:', error);
      return [];
    }

    return patterns || [];
  }
}
