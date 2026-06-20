import { test, expect } from '@playwright/test';
import {
  collectImportantConsoleMessages,
  expectNoUnsafeRenderedText,
  gotoApp,
  jsonResponse,
  setAuthToken,
  setLocale,
} from './helpers';

test.describe('Beta analytics screen', () => {
  test('renders aggregate PM metrics for admin users', async ({ page }) => {
    const consoleMessages = collectImportantConsoleMessages(page);

    await setAuthToken(page);
    await setLocale(page);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if (path === '/telemetry/beta-analytics') {
        return route.fulfill(jsonResponse({
          generated_at: '2026-06-07T00:00:00.000Z',
          window_days: 30,
          access: 'admin',
          forecast: {
            snapshots: 28,
            avg_absolute_error: 14,
            classification_accuracy: 82,
            avg_forecast_score: 76,
            avg_actual_adherence: 72,
            sample_status: 'learning',
          },
          calibration: {
            buckets: [
              { bucket_order: 4, forecast_bucket: '60-80', samples: 30, avg_forecast_score: 70, actual_success_rate: 68, calibration_error: 2, calibration_status: 'calibrated', confidence_level: 'medium' },
              { bucket_order: 5, forecast_bucket: '80-100', samples: 10, avg_forecast_score: 86, actual_success_rate: 40, calibration_error: 46, calibration_status: 'insufficient', confidence_level: 'low' },
            ],
            total_samples: 40,
            avg_calibration_error: 13,
            worst_bucket: '80-100',
            status: 'insufficient',
          },
          interventions: {
            total_shown: 80,
            total_acted: 46,
            total_dismissed: 8,
            action_rate: 58,
            dismiss_rate: 10,
            ready_count: 2,
            top_effective: [
              { intervention_type: 'protein_nudge', mode: 'coach_action', primary_action: 'log_meal', shown: 25, acted: 18, dismissed: 2, action_rate: 72, dismiss_rate: 8, sample_status: 'ready' },
            ],
            top_ignored: [
              { intervention_type: 'reminder_tuning', mode: 'light_nudge', primary_action: 'adjust_reminders', shown: 22, acted: 3, dismissed: 9, action_rate: 14, dismiss_rate: 41, sample_status: 'ready' },
            ],
          },
          reminders: {
            weeks: 4,
            avg_open_rate: 61,
            avg_action_rate: 28,
            fatigue_weeks: 1,
            fatigue_level: 'medium',
          },
          engagement: {
            active_users_7d: 12,
            active_users_30d: 18,
            avg_food_logs_per_active_day: 3.2,
            avg_activity_logs_per_active_day: 0.8,
            recent_daily: [
              { local_date: '2026-06-07', active_users: 12, food_logs: 34, activity_logs: 8, roadmap_completed: 7, interventions_shown: 6, interventions_acted: 4, forecast_snapshots: 12 },
            ],
          },
          recommendations: [
            'Collect more forecast outcomes before tuning weights (28/100).',
            'Reminder fatigue is visible; reduce frequency or shift timing for ignored reminders.',
          ],
        }));
      }

      if (path === '/telemetry/ai-usage-summary') {
        return route.fulfill(jsonResponse({
          generated_at: '2026-06-07T00:00:00.000Z',
          window_days: 30,
          total_requests: 0,
          total_reserved: 0,
          total_success: 0,
          total_fallback: 0,
          total_failed: 0,
          total_blocked: 0,
          estimated_cost_usd: 0,
          top_features: [],
          top_users: [],
          providers: [],
          models: [],
        }));
      }

      if (
        path.startsWith('/telemetry/')
        || path.startsWith('/user/')
        || path.startsWith('/subscriptions/')
      ) {
        return route.fulfill(jsonResponse({}));
      }

      return route.continue();
    });

    await gotoApp(page, '/beta-analytics');

    await expect(page.getByText('Beta Measurement')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Forecast accuracy', { exact: true })).toBeVisible();
    await expect(page.getByText('82%')).toBeVisible();
    await expect(page.getByText('Forecast calibration')).toBeVisible();
    await expect(page.getByText('80-100% forecast')).toBeVisible();
    await expect(page.getByText('Actual 40%')).toBeVisible();
    await expect(page.getByText('Top effective interventions')).toBeVisible();
    await expect(page.getByText('Protein Nudge')).toBeVisible();
    await expect(page.getByText('Most ignored interventions')).toBeVisible();
    await expect(page.getByText('Reminder Tuning')).toBeVisible();
    await expectNoUnsafeRenderedText(page);
    expect(consoleMessages).toEqual([]);
  });
});
