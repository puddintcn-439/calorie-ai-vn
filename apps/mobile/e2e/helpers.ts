import { expect, Page } from '@playwright/test';

export async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

export async function setAuthToken(page: Page, token = 'test-token', userId = 'user-1') {
  await page.addInitScript(({ token: authToken, userId: authUserId }) => {
    sessionStorage.setItem('auth_token', authToken);
    sessionStorage.setItem('user_id', authUserId);
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('user_id', authUserId);
  }, { token, userId });
}

export function jsonResponse(obj: any) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(obj),
  };
}

export function getDateDaysAgo(daysAgo: number, base = new Date()) {
  const date = new Date(base);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function buildFoodLog(day: string, index: number, mealType: string, calories: number) {
  return {
    id: `${day}-${mealType}`,
    user_id: 'user-1',
    meal_type: mealType,
    logged_at: `${day}T${mealType === 'breakfast' ? '07:30:00' : mealType === 'lunch' ? '12:30:00' : '19:00:00'}.000Z`,
    quantity: 1,
    unit: 'serving',
    estimated_grams: mealType === 'breakfast' ? 220 : 360,
    calories,
    protein_g: mealType === 'breakfast' ? 24 : 42,
    carbs_g: mealType === 'breakfast' ? 42 : 64,
    fat_g: mealType === 'breakfast' ? 12 : 20,
    fiber_g: mealType === 'breakfast' ? 6 : 9,
    sugar_g: mealType === 'breakfast' ? 9 : 7,
    saturated_fat_g: mealType === 'breakfast' ? 3 : 5,
    sodium_mg: mealType === 'breakfast' ? 420 : 680,
    name: mealType === 'breakfast' ? 'Greek yogurt bowl' : index % 2 === 0 ? 'Chicken rice' : 'Salmon salad',
    name_vi: mealType === 'breakfast' ? 'Sua chua ngu coc' : index % 2 === 0 ? 'Com ga' : 'Salad ca hoi',
    source: 'manual_entry',
    created_at: `${day}T08:00:00.000Z`,
    updated_at: `${day}T08:00:00.000Z`,
  };
}

function buildDailyLogs(days = 90) {
  return Array.from({ length: days }, (_, offset) => {
    const day = getDateDaysAgo(days - 1 - offset);
    const breakfast = buildFoodLog(day, offset, 'breakfast', 430 + (offset % 3) * 15);
    const lunch = buildFoodLog(day, offset, 'lunch', 690 + (offset % 4) * 20);
    const dinner = buildFoodLog(day, offset, 'dinner', 620 + (offset % 5) * 18);
    const logs = [breakfast, lunch, dinner];
    const total = logs.reduce((sum, log) => sum + log.calories, 0);

    return {
      date: day,
      logs,
      total_calories: total,
      total_protein_g: logs.reduce((sum, log) => sum + log.protein_g, 0),
      total_carbs_g: logs.reduce((sum, log) => sum + log.carbs_g, 0),
      total_fat_g: logs.reduce((sum, log) => sum + log.fat_g, 0),
      total_fiber_g: logs.reduce((sum, log) => sum + log.fiber_g, 0),
      total_sugar_g: logs.reduce((sum, log) => sum + log.sugar_g, 0),
      total_saturated_fat_g: logs.reduce((sum, log) => sum + log.saturated_fat_g, 0),
      total_sodium_mg: logs.reduce((sum, log) => sum + log.sodium_mg, 0),
      nutrition_quality_coverage: {
        total_items: logs.length,
        fiber_items: logs.length,
        sugar_items: logs.length,
        saturated_fat_items: logs.length,
        sodium_items: logs.length,
      },
      target_calories: 1850,
      remaining_calories: 1850 - total,
    };
  });
}

function buildBodyEntries(days = 90) {
  return Array.from({ length: days }, (_, offset) => {
    const day = getDateDaysAgo(days - 1 - offset);
    const weight = 75 - (offset / (days - 1)) * 4.2;
    return {
      id: offset + 1,
      user_id: 'user-1',
      recorded_at: day,
      weight_kg: Number(weight.toFixed(1)),
      waist_cm: Number((91 - offset * 0.05).toFixed(1)),
      body_fat_pct: Number((28 - offset * 0.04).toFixed(1)),
      energy_level: 4,
      note: offset % 14 === 0 ? 'weekly check-in' : '',
      created_at: `${day}T07:00:00.000Z`,
      updated_at: `${day}T07:00:00.000Z`,
    };
  });
}

function buildWeeklyInsights(logsByDay: ReturnType<typeof buildDailyLogs>) {
  const lastSeven = logsByDay.slice(-7);
  const dailyInsights = lastSeven.map((day, idx) => ({
    date: day.date,
    day_name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx],
    calories: day.total_calories,
    protein_g: day.total_protein_g,
    carbs_g: day.total_carbs_g,
    fat_g: day.total_fat_g,
    calorie_target: day.target_calories,
    adherence_percentage: (day.total_calories / day.target_calories) * 100,
    meal_count: day.logs.length,
  }));
  const weeklyTotal = lastSeven.reduce((sum, day) => sum + day.total_calories, 0);
  const weeklyTarget = lastSeven.reduce((sum, day) => sum + day.target_calories, 0);
  const protein = lastSeven.reduce((sum, day) => sum + day.total_protein_g, 0);
  const carbs = lastSeven.reduce((sum, day) => sum + day.total_carbs_g, 0);
  const fat = lastSeven.reduce((sum, day) => sum + day.total_fat_g, 0);
  const macroTotalCalories = protein * 4 + carbs * 4 + fat * 9;

  return {
    period: `${lastSeven[0].date} - ${lastSeven[lastSeven.length - 1].date}`,
    week_start_date: lastSeven[0].date,
    week_end_date: lastSeven[lastSeven.length - 1].date,
    daily_insights: dailyInsights,
    weekly_calories_total: weeklyTotal,
    weekly_calorie_target: weeklyTarget,
    weekly_adherence_percentage: (weeklyTotal / weeklyTarget) * 100,
    total_meals_logged: lastSeven.reduce((sum, day) => sum + day.logs.length, 0),
    average_calories_per_day: weeklyTotal / 7,
    macro_breakdown: {
      protein_percentage: (protein * 4 / macroTotalCalories) * 100,
      carbs_percentage: (carbs * 4 / macroTotalCalories) * 100,
      fat_percentage: (fat * 9 / macroTotalCalories) * 100,
      protein_grams: protein,
      carbs_grams: carbs,
      fat_grams: fat,
    },
    meal_breakdown: {
      breakfast_calories: lastSeven.reduce((sum, day) => sum + day.logs[0].calories, 0),
      lunch_calories: lastSeven.reduce((sum, day) => sum + day.logs[1].calories, 0),
      dinner_calories: lastSeven.reduce((sum, day) => sum + day.logs[2].calories, 0),
      snack_calories: 0,
      breakfast_count: 7,
      lunch_count: 7,
      dinner_count: 7,
      snack_count: 0,
    },
    days_on_target: dailyInsights.filter((day) => day.adherence_percentage >= 85 && day.adherence_percentage <= 115).length,
    best_day_calories: Math.min(...dailyInsights.map((day) => day.calories)),
    worst_day_calories: Math.max(...dailyInsights.map((day) => day.calories)),
    trend_vs_last_week: -3.4,
  };
}

export function createNinetyDayJourneyMock() {
  const logsByDay = buildDailyLogs(90);
  const today = logsByDay[logsByDay.length - 1];
  const bodyEntries = buildBodyEntries(90);
  const latest = bodyEntries[bodyEntries.length - 1];
  const first = bodyEntries[0];

  return {
    today,
    profile: {
      id: 'user-1',
      email: 'journey@example.com',
      full_name: 'Journey User',
      age: 25,
      gender: 'male',
      height_cm: 170,
      weight_kg: 70.8,
      goal: 'lose_weight',
      activity_level: 'moderate',
      health_flags: [],
      daily_calorie_target: 1850,
      target_breakfast_cal: 460,
      target_lunch_cal: 650,
      target_dinner_cal: 560,
      target_snack_cal: 180,
      goal_plan: {
        direction: 'loss',
        target_kg: 5,
        duration_weeks: 12,
        start_date: logsByDay[0].date,
        computed_daily_calorie_target: 1850,
        weekly_rate_kg: 0.42,
        safety_status: 'ok',
        warnings: [],
      },
    },
    activityLogs: [
      {
        id: 'activity-today',
        user_id: 'user-1',
        activity_type: 'walking',
        duration_min: 35,
        calories_burned: 160,
        logged_at: `${today.date}T17:30:00.000Z`,
        notes: 'MOVEMENT_PLAN:Walk',
        created_at: `${today.date}T17:30:00.000Z`,
      },
    ],
    activityPreferences: [
      { id: 'walk-30', title: 'Walk 30 minutes', activity_type: 'walking', duration_min: 30 },
      { id: 'gym-30', title: 'Strength session', activity_type: 'gym', duration_min: 30 },
    ],
    gamification: {
      current_streak: 90,
      longest_streak: 90,
      active_days_last_30: 30,
      total_food_logs: 270,
      total_activity_logs: 45,
      next_streak_milestone: null,
      badges: [
        { id: 'first_log', label: 'First log', description: 'Logged first meal', icon: 'checkmark', unlocked: true },
        { id: 'seven_day_streak', label: '7-day streak', description: 'Logged seven days', icon: 'flame', unlocked: true },
      ],
    },
    savedMeals: [
      {
        id: 'saved-missing-totals',
        user_id: 'user-1',
        name: 'High protein lunch',
        items: [
          { name: 'Chicken rice', calories: 620, protein_g: 45, carbs_g: 68, fat_g: 18, estimated_grams: 420 },
          { name: 'Vegetable soup', calories: 110, protein_g: 5, carbs_g: 12, fat_g: 4, estimated_grams: 250 },
        ],
        use_count: 12,
        created_at: `${today.date}T09:00:00.000Z`,
      },
    ],
    bodyTrend: {
      entries: bodyEntries,
      weight_change_kg: Number((latest.weight_kg - first.weight_kg).toFixed(1)),
      weight_change_7d: -0.3,
      waist_change_cm: Number((latest.waist_cm - first.waist_cm).toFixed(1)),
      days_tracked: bodyEntries.length,
      latest_entry: latest,
      first_entry: first,
      progress_summary: {
        period_days: 90,
        logged_days: 90,
        weeks_with_logs: 13,
        average_weekly_adherence_pct: 97.2,
        average_daily_calories: 1815,
        calorie_target: 1850,
        weight_delta_kg: Number((latest.weight_kg - first.weight_kg).toFixed(1)),
        weight_goal_kg: 5,
        weight_goal_direction: 'loss',
        weight_goal_progress_pct: 84,
        data_status: 'ready',
      },
    },
    todaySummary: {
      date: today.date,
      timezone_offset_minutes: -420,
      daily_log: today,
      activity_logs: [
        {
          id: 'activity-today',
          user_id: 'user-1',
          activity_type: 'walking',
          duration_min: 35,
          calories_burned: 160,
          logged_at: `${today.date}T17:30:00.000Z`,
          notes: 'MOVEMENT_PLAN:Walk',
          created_at: `${today.date}T17:30:00.000Z`,
        },
      ],
      daily_roadmap: [],
      activity_preferences: [],
      profile: null,
      plan: {
        target_calories: 1850,
        consumed_calories: today.total_calories,
        burned_calories: 160,
        net_calories: Math.max(0, today.total_calories - 160),
        remaining_calories: 1850 - Math.max(0, today.total_calories - 160),
        roadmap_total: 0,
        roadmap_completed: 0,
        roadmap_remaining: 0,
        planned_activity_kcal: 0,
      },
      health_score: {
        overall: 83,
        label: 'strong',
        nutrition: 88,
        activity: 82,
        consistency: 90,
        recovery: 78,
        trend: {
          average_7d: 76,
          delta_vs_7d: 7,
          direction: 'up',
          days_with_data: 7,
        },
        weekly_adherence: {
          overall: 86,
          nutrition: 88,
          activity: 80,
          logging: 100,
          plan: 75,
          days_tracked: 7,
          days_with_logs: 7,
          days_with_activity: 5,
          weakest_area: 'plan',
          patterns: ['Daily plan was incomplete 3/7 days'],
        },
        signals: ['Daily plan was incomplete 3/7 days', 'Nutrition is close to plan'],
        next_action: 'complete_plan',
      },
      status: {
        daily_log: 'ok',
        activity_logs: 'ok',
        daily_roadmap: 'ok',
        activity_preferences: 'ok',
        profile: 'ok',
      },
    },
    weeklyInsights: buildWeeklyInsights(logsByDay),
    coachingInsights: [
      {
        id: 1,
        user_id: 'user-1',
        insight_type: 'achievement',
        title: 'Great consistency this week.',
        description: 'You logged every day and stayed close to your calorie target.',
        action_suggestion: 'Keep the current breakfast and walking routine.',
        impact_score: 8,
        is_acknowledged: false,
        created_at: `${today.date}T10:00:00.000Z`,
        emoji: 'check',
      },
    ],
    coachingSummary: {
      id: 1,
      user_id: 'user-1',
      week_start_date: getDateDaysAgo(6),
      logs_count: 21,
      adherence_percentage: 97,
      consistency_score: 1,
      insights_generated: 1,
      total_calories: 12705,
      average_daily_calories: 1815,
      calorie_variance: 84,
      days_above_target: 2,
      days_below_target: 1,
      days_on_target: 7,
      recommended_action: 'Great consistency this week. Keep the current rhythm.',
      priority_level: 'low',
      created_at: `${today.date}T10:00:00.000Z`,
      updated_at: `${today.date}T10:00:00.000Z`,
    },
    reminderEffectiveness: {
      days: 30,
      sent: 24,
      opened: 18,
      acted: 11,
      ignored: 6,
      open_rate: 75,
      action_rate: 46,
      ignore_rate: 25,
      effectiveness_score: 53,
      best_meal: 'breakfast',
      weakest_meal: 'dinner',
      recommendation: 'Breakfast reminders are working. Dinner reminders may need a gentler time.',
      patterns: ['breakfast reminders work best (58% action rate)', 'dinner reminders are often ignored (60%)'],
      by_meal: {
        breakfast: { sent: 6, opened: 6, acted: 4, ignored: 0, open_rate: 100, action_rate: 67, ignore_rate: 0 },
        lunch: { sent: 6, opened: 5, acted: 3, ignored: 1, open_rate: 83, action_rate: 50, ignore_rate: 17 },
        dinner: { sent: 6, opened: 2, acted: 1, ignored: 4, open_rate: 33, action_rate: 17, ignore_rate: 67 },
        snack: { sent: 6, opened: 5, acted: 3, ignored: 1, open_rate: 83, action_rate: 50, ignore_rate: 17 },
      },
      by_action: {
        food_log: { acted: 9, action_rate: 38 },
        activity_log: { acted: 2, action_rate: 8 },
      },
    },
    behaviorMemory: {
      days_analyzed: 90,
      data_quality: 'high',
      best_reminder_hour: 19,
      often_skips_breakfast: false,
      often_skips_lunch: false,
      often_skips_dinner: false,
      low_activity_days: ['Sun'],
      best_logging_streak: 21,
      high_protein_adherence: 0.78,
      activity_adherence: 0.62,
      meal_skip_rates: {
        breakfast: 0.18,
        lunch: 0.04,
        dinner: 0.02,
        snack: 0.42,
      },
      memory_notes: ['Reminder responses are strongest around 19:00.', 'Best logging streak is 21 days.'],
      updated_at: `${today.date}T10:00:00.000Z`,
    },
    interventionMemory: {
      days_analyzed: 90,
      total_shown: 18,
      total_acted: 11,
      total_dismissed: 2,
      overall_action_rate: 61,
      best_intervention: 'activity_recovery',
      weakest_intervention: 'reminder_tuning',
      ranking: [
        {
          intervention_type: 'activity_recovery',
          shown: 7,
          acted: 5,
          dismissed: 0,
          action_rate: 71,
          dismiss_rate: 0,
          effectiveness_score: 71,
          last_shown_at: `${today.date}T08:00:00.000Z`,
          last_acted_at: `${today.date}T08:05:00.000Z`,
          primary_action: 'move',
        },
        {
          intervention_type: 'reminder_tuning',
          shown: 6,
          acted: 2,
          dismissed: 2,
          action_rate: 33,
          dismiss_rate: 33,
          effectiveness_score: 25,
          last_shown_at: `${today.date}T07:00:00.000Z`,
          last_acted_at: `${today.date}T07:20:00.000Z`,
          primary_action: 'adjust_reminders',
        },
      ],
      by_type: {},
      updated_at: `${today.date}T10:00:00.000Z`,
    },
    interventionAnalytics: {
      min_sample: 20,
      sample_status: 'learning',
      windows: {
        seven_day: {
          days: 7,
          total_shown: 6,
          total_acted: 4,
          total_dismissed: 1,
          action_rate: 67,
          dismiss_rate: 17,
          top_effective: [
            {
              intervention_type: 'activity_recovery',
              shown: 3,
              acted: 3,
              dismissed: 0,
              action_rate: 100,
              dismiss_rate: 0,
              effectiveness_score: 100,
              last_shown_at: `${today.date}T08:00:00.000Z`,
              last_acted_at: `${today.date}T08:05:00.000Z`,
              primary_action: 'move',
            },
          ],
          top_ignored: [],
          ranking: [],
        },
        thirty_day: {
          days: 30,
          total_shown: 18,
          total_acted: 11,
          total_dismissed: 2,
          action_rate: 61,
          dismiss_rate: 11,
          top_effective: [
            {
              intervention_type: 'activity_recovery',
              shown: 7,
              acted: 5,
              dismissed: 0,
              action_rate: 71,
              dismiss_rate: 0,
              effectiveness_score: 71,
              last_shown_at: `${today.date}T08:00:00.000Z`,
              last_acted_at: `${today.date}T08:05:00.000Z`,
              primary_action: 'move',
            },
          ],
          top_ignored: [
            {
              intervention_type: 'reminder_tuning',
              shown: 6,
              acted: 2,
              dismissed: 2,
              action_rate: 33,
              dismiss_rate: 33,
              effectiveness_score: 25,
              last_shown_at: `${today.date}T07:00:00.000Z`,
              last_acted_at: `${today.date}T07:20:00.000Z`,
              primary_action: 'adjust_reminders',
            },
          ],
          ranking: [],
        },
      },
      ready_interventions: [],
      insufficient_interventions: ['activity_recovery', 'reminder_tuning'],
      best_intervention: 'activity_recovery',
      weakest_intervention: 'reminder_tuning',
      recommendations: ['Overall sample is usable, but each intervention still needs 20 shown events before ranking drives decisions.'],
      updated_at: `${today.date}T10:00:00.000Z`,
    },
  };
}

export async function mockNinetyDayJourneyApi(page: Page) {
  const mock = createNinetyDayJourneyMock();

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const isApiPath = /^\/(user|log|today|activity-preferences|gamification|body-progress|insights|coaching|calorie-target|roadmap|subscriptions|reminders|telemetry)(\/|$)/.test(path);

    if (request.resourceType() === 'document' && url.port !== '3000') {
      return route.continue();
    }

    if (url.port !== '3000' && !isApiPath) {
      return route.continue();
    }

    if (path === '/user/profile') return route.fulfill(jsonResponse(mock.profile));
    if (path === '/log/daily') return route.fulfill(jsonResponse(mock.today));
    if (path === '/log/activity') return route.fulfill(jsonResponse(mock.activityLogs));
    if (path === '/log/saved-meals') return route.fulfill(jsonResponse(mock.savedMeals));
    if (path === '/today/summary') return route.fulfill(jsonResponse(mock.todaySummary));
    if (path === '/activity-preferences') return route.fulfill(jsonResponse(mock.activityPreferences));
    if (path === '/gamification/summary') return route.fulfill(jsonResponse(mock.gamification));
    if (path === '/body-progress/trend') return route.fulfill(jsonResponse(mock.bodyTrend));
    if (path === '/insights/weekly') return route.fulfill(jsonResponse(mock.weeklyInsights));
    if (path === '/coaching/insights') return route.fulfill(jsonResponse(mock.coachingInsights));
    if (path === '/coaching/weekly-summary') return route.fulfill(jsonResponse(mock.coachingSummary));
    if (path === '/coaching/behavior-memory') return route.fulfill(jsonResponse(mock.behaviorMemory));
    if (path === '/coaching/interventions/analytics') return route.fulfill(jsonResponse(mock.interventionAnalytics));
    if (path === '/coaching/interventions/memory') return route.fulfill(jsonResponse(mock.interventionMemory));
    if (path === '/coaching/interventions/events') return route.fulfill(jsonResponse({ recorded: true }));
    if (path === '/telemetry/forecast-snapshots') return route.fulfill(jsonResponse({ recorded: true }));
    if (path === '/calorie-target/me') {
      return route.fulfill(jsonResponse({
        daily_calorie_target: 1850,
        bmr: 1650,
        tdee: 2350,
        bmi: 24.5,
        body_status: 'normal',
        weight_recommendation: 'decrease',
        recommended_goal: 'lose_weight',
        effective_goal: 'lose_weight',
        recommendation_note: 'Moderate deficit',
        target_breakfast_cal: 460,
        target_lunch_cal: 650,
        target_dinner_cal: 560,
        target_snack_cal: 180,
        calculation_date: mock.today.date,
        protein_target_g: 105,
        fat_g: 62,
        carbs_g: 210,
      }));
    }
    if (path === '/calorie-target/recommendations/me' || path === '/calorie-target/recommendations') {
      return route.fulfill(jsonResponse({
        user_id: 'user-1',
        date: mock.today.date,
        daily_target: 1850,
        remaining_calories: 95,
        meals: [
          { meal_type: 'breakfast', recommended_calories: 460, suggested_foods: [], tips: 'Keep protein high.' },
          { meal_type: 'lunch', recommended_calories: 650, suggested_foods: [], tips: 'Add vegetables.' },
          { meal_type: 'dinner', recommended_calories: 560, suggested_foods: [], tips: 'Keep dinner lighter.' },
          { meal_type: 'snack', recommended_calories: 180, suggested_foods: [], tips: 'Use fruit or yogurt.' },
        ],
        weekly_insights: {
          average_adherence: 97,
          trend: 'improving',
          suggestion: 'Current pace is sustainable.',
        },
      }));
    }
    if (path === '/calorie-target/weekly-adjustment/preview') {
      return route.fulfill(jsonResponse({
        user_id: 'user-1',
        original_daily_target: 1850,
        adjusted_daily_target: 1840,
        adjustment_percentage: -1,
        adherence_last_week: 97,
        recommendation: 'No major adjustment needed.',
        last_updated: `${mock.today.date}T10:00:00.000Z`,
        algorithm_version: 'e2e',
        clamp_reason: null,
        actual_tdee: 2320,
        days_logged: 90,
        weight_logs: 90,
      }));
    }
    if (path.startsWith('/roadmap')) return route.fulfill(jsonResponse([]));
    if (path.startsWith('/subscriptions')) return route.fulfill(jsonResponse({ tier: 'premium', active: true }));
    if (path === '/reminders/effectiveness') return route.fulfill(jsonResponse(mock.reminderEffectiveness));
    if (path.startsWith('/reminders')) return route.fulfill(jsonResponse({ enabled: false }));
    if (request.method() !== 'GET') return route.fulfill(jsonResponse({ ok: true }));

    return route.fulfill(jsonResponse({}));
  });

  return mock;
}

export function collectImportantConsoleMessages(page: Page) {
  const messages: string[] = [];
  const important = /(NaN|Infinity|undefined|pointerEvents is deprecated|Failed prop type|Warning:|Unhandled|TypeError|ReferenceError)/i;

  page.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'warning' || message.type() === 'error') && important.test(text)) {
      messages.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    messages.push(`pageerror: ${error.message}`);
  });

  return messages;
}

export async function expectNoUnsafeRenderedText(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\b(?:NaN|undefined|Infinity)\b/);
}

export async function expectBottomNavDoesNotCoverInteractiveContent(page: Page) {
  const offenders = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const tablist = document.querySelector('[role="tablist"]');
    const tabRect = tablist?.getBoundingClientRect();
    const protectedTop = tabRect ? tabRect.top : window.innerHeight - 86;
    const candidates = Array.from(document.querySelectorAll('button, input, textarea, [role="button"], a[href]'));

    return candidates
      .filter((node) => {
        if (tablist?.contains(node)) return false;
        const element = node as HTMLElement;
        const style = window.getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return rect.bottom > protectedTop - 6 && rect.top < window.innerHeight;
      })
      .map((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()} "${(element.innerText || element.getAttribute('aria-label') || '').slice(0, 60)}" bottom=${Math.round(rect.bottom)} protectedTop=${Math.round(protectedTop)}`;
      });
  });

  expect(offenders).toEqual([]);
}

export async function expectElementAboveBottomNav(page: Page, testId: string) {
  const layout = await page.evaluate((targetTestId) => {
    const target = document.querySelector(`[data-testid="${targetTestId}"]`);
    const tablist = document.querySelector('[role="tablist"]');
    const targetRect = target?.getBoundingClientRect();
    const tabRect = tablist?.getBoundingClientRect();
    return {
      targetFound: Boolean(targetRect),
      targetBottom: targetRect ? Math.round(targetRect.bottom) : null,
      protectedTop: tabRect ? Math.round(tabRect.top) : Math.round(window.innerHeight - 86),
    };
  }, testId);

  expect(layout.targetFound).toBe(true);
  expect(layout.targetBottom).not.toBeNull();
  expect(layout.targetBottom as number).toBeLessThanOrEqual((layout.protectedTop as number) - 6);
}
