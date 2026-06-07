#!/usr/bin/env node

/**
 * Seed a synthetic 30-day beta cohort for the behavior measurement dashboards.
 *
 * This script uses Supabase service-role REST APIs so it can run without a direct
 * Postgres connection string. It creates deterministic test accounts with the
 * email prefix `beta.seed+NN@calorie-ai-vn.test`, then replaces measurement data
 * for only those synthetic users.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_ENV = path.join(ROOT, 'apps', 'backend', '.env');
const USER_COUNT = Number(process.env.BETA_SEED_USERS || 30);
const DAYS = Number(process.env.BETA_SEED_DAYS || 30);
const EMAIL_DOMAIN = process.env.BETA_SEED_EMAIL_DOMAIN || 'calorie-ai-vn.test';
const PASSWORD = process.env.BETA_SEED_PASSWORD || 'BetaSeed0123!';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(BACKEND_ENV);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Expected them in apps/backend/.env or process env.');
  process.exit(2);
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function atUtc(dateKey, hour, minute = 0) {
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return body;
}

function restUrl(table, query = '') {
  return `${SUPABASE_URL}/rest/v1/${table}${query}`;
}

async function select(table, query) {
  return requestJson(restUrl(table, query), {
    method: 'GET',
    headers: restHeaders,
  });
}

async function insertRows(table, rows, batchSize = 500) {
  for (const batch of chunk(rows, batchSize)) {
    await requestJson(restUrl(table), {
      method: 'POST',
      headers: {
        ...restHeaders,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }
}

async function upsertRows(table, rows, conflict, batchSize = 500) {
  for (const batch of chunk(rows, batchSize)) {
    await requestJson(restUrl(table, `?on_conflict=${encodeURIComponent(conflict)}`), {
      method: 'POST',
      headers: {
        ...restHeaders,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(batch),
    });
  }
}

async function deleteForUserIds(table, ids) {
  for (const id of ids) {
    await requestJson(restUrl(table, `?user_id=eq.${id}`), {
      method: 'DELETE',
      headers: {
        ...restHeaders,
        Prefer: 'return=minimal',
      },
    });
  }
}

async function createOrFindAuthUser(email, index) {
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        seed: 'beta_measurement_cohort',
        cohort_index: index,
      },
    }),
  });
  const text = await created.text();
  const body = text ? JSON.parse(text) : null;
  if (created.ok) return body;

  const message = JSON.stringify(body);
  if (!message.includes('already') && !message.includes('registered')) {
    throw new Error(`Could not create auth user ${email}: ${created.status} ${message}`);
  }

  const existing = await select('users', `?select=id,email&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (existing[0]) return existing[0];

  const listed = await requestJson(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    method: 'GET',
    headers: authHeaders,
  });
  const found = (listed.users || []).find((user) => String(user.email).toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`Auth user exists but could not be found: ${email}`);
  return found;
}

function cohortUsers(authUsers) {
  return authUsers.map((user, idx) => {
    const profile = userProfile(idx);
    const target = 1750 + (idx % 6) * 120;
    return {
      id: user.id,
      email: user.email,
      full_name: `Beta Seed User ${String(idx + 1).padStart(2, '0')}`,
      weight_kg: 55 + (idx % 9) * 4,
      height_cm: 158 + (idx % 8) * 5,
      age: 22 + (idx % 22),
      gender: idx % 2 === 0 ? 'female' : 'male',
      activity_level: profile.activity,
      goal: profile.goal,
      daily_calorie_target: target,
      target_breakfast_cal: Math.round(target * 0.25),
      target_lunch_cal: Math.round(target * 0.35),
      target_dinner_cal: Math.round(target * 0.3),
      target_snack_cal: Math.round(target * 0.1),
      updated_at: new Date().toISOString(),
    };
  });
}

function userProfile(index) {
  const profiles = [
    {
      name: 'consistent_logger',
      goal: 'maintain',
      activity: 'moderate',
      food: 0.9,
      activityHit: 0.62,
      roadmap: 0.82,
      open: 0.78,
      action: 0.55,
      trend: 0.02,
      weekendDrop: 0.08,
      fatigue: 0.1,
      forecastBias: 2,
      gymDays: [1, 3, 5],
    },
    {
      name: 'busy_professional',
      goal: 'lose_weight',
      activity: 'light',
      food: 0.58,
      activityHit: 0.28,
      roadmap: 0.42,
      open: 0.5,
      action: 0.28,
      trend: -0.02,
      weekendDrop: 0.22,
      fatigue: 0.35,
      forecastBias: 8,
      stressDays: [9, 10, 17, 18],
    },
    {
      name: 'gym_muscle_gain',
      goal: 'gain_muscle',
      activity: 'active',
      food: 0.76,
      activityHit: 0.7,
      roadmap: 0.76,
      open: 0.64,
      action: 0.48,
      trend: 0.01,
      weekendDrop: 0.05,
      fatigue: 0.18,
      forecastBias: 0,
      gymDays: [1, 3, 5],
    },
    {
      name: 'improving_weight_loss',
      goal: 'lose_weight',
      activity: 'moderate',
      food: 0.5,
      activityHit: 0.34,
      roadmap: 0.48,
      open: 0.62,
      action: 0.42,
      trend: 0.32,
      weekendDrop: 0.12,
      fatigue: 0.08,
      forecastBias: -6,
    },
    {
      name: 'low_engagement',
      goal: 'maintain',
      activity: 'sedentary',
      food: 0.24,
      activityHit: 0.14,
      roadmap: 0.2,
      open: 0.22,
      action: 0.09,
      trend: -0.03,
      weekendDrop: 0.18,
      fatigue: 0.45,
      forecastBias: 4,
      stressDays: [6, 7, 8, 21, 22],
    },
    {
      name: 'weekend_social_drop',
      goal: 'lose_weight',
      activity: 'moderate',
      food: 0.74,
      activityHit: 0.45,
      roadmap: 0.56,
      open: 0.56,
      action: 0.32,
      trend: 0,
      weekendDrop: 0.34,
      fatigue: 0.22,
      forecastBias: 10,
    },
    {
      name: 'overconfident_risk',
      goal: 'lose_weight',
      activity: 'light',
      food: 0.38,
      activityHit: 0.24,
      roadmap: 0.34,
      open: 0.36,
      action: 0.16,
      trend: -0.06,
      weekendDrop: 0.24,
      fatigue: 0.28,
      forecastBias: 24,
      stressDays: [12, 13, 14],
    },
    {
      name: 'underconfident_rebound',
      goal: 'gain_muscle',
      activity: 'active',
      food: 0.82,
      activityHit: 0.64,
      roadmap: 0.78,
      open: 0.76,
      action: 0.56,
      trend: 0.16,
      weekendDrop: 0.08,
      fatigue: 0.05,
      forecastBias: -18,
      gymDays: [2, 4, 6],
    },
  ];
  return profiles[index % profiles.length];
}

function random01(userIndex, dayIndex, salt = 0) {
  const x = Math.sin((userIndex + 1) * 917.23 + (dayIndex + 1) * 131.91 + (salt + 1) * 71.17) * 10000;
  return x - Math.floor(x);
}

function deterministicHit(userIndex, dayIndex, threshold, salt = 0) {
  return random01(userIndex, dayIndex, salt) < clamp(threshold, 0.01, 0.99);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function avg(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rateFromHistory(history, key, fallback) {
  const recent = history.slice(-7);
  if (recent.length === 0) return fallback;
  return avg(recent.map((day) => Number(Boolean(day[key]))));
}

function adherenceScoreFromRates(foodRate, activityRate, roadmapRate) {
  return Math.round(
    Math.min(foodRate / 0.75, 1) * 45
    + Math.min(activityRate / 0.45, 1) * 35
    + Math.min(roadmapRate / 0.75, 1) * 20,
  );
}

function buildRows(users) {
  const baseDate = todayKey();
  const foodRows = [];
  const activityRows = [];
  const roadmapRows = [];
  const reminderRows = [];
  const forecastRows = [];
  const interventionRows = [];

  users.forEach((user, userIndex) => {
    const profile = userProfile(userIndex);
    const history = [];

    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
      const dayIndex = DAYS - 1 - dayOffset;
      const localDate = addDays(baseDate, -dayOffset);
      const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
      const isWeekend = day === 0 || day === 6;
      const isGymDay = Array.isArray(profile.gymDays) ? profile.gymDays.includes(day) : false;
      const isStressDay = Array.isArray(profile.stressDays) ? profile.stressDays.includes(dayIndex) : false;
      const progress = dayIndex / Math.max(DAYS - 1, 1);
      const fatiguePenalty = profile.fatigue * progress;
      const weekendPenalty = isWeekend ? profile.weekendDrop : 0;
      const stressPenalty = isStressDay ? 0.28 : 0;
      const trendBoost = profile.trend * progress;
      const foodProbability = clamp(profile.food + trendBoost - weekendPenalty - stressPenalty, 0.04, 0.98);
      const activityProbability = clamp(profile.activityHit + trendBoost * 0.5 + (isGymDay ? 0.22 : -0.04) - weekendPenalty * 0.45 - stressPenalty * 0.5, 0.03, 0.96);
      const roadmapProbability = clamp(profile.roadmap + trendBoost * 0.7 - weekendPenalty * 0.75 - stressPenalty * 0.7, 0.03, 0.98);
      const openProbability = clamp(profile.open - fatiguePenalty - weekendPenalty * 0.35 - stressPenalty * 0.35, 0.03, 0.96);
      const foodHit = deterministicHit(userIndex, dayIndex, foodProbability, 1);
      const activityHit = deterministicHit(userIndex, dayIndex, activityProbability, 2);
      const roadmapHit = deterministicHit(userIndex, dayIndex, roadmapProbability, 3);
      const reminderOpen = deterministicHit(userIndex, dayIndex, openProbability, 4);
      const reminderAct = reminderOpen && deterministicHit(userIndex, dayIndex, clamp(profile.action + trendBoost - fatiguePenalty * 0.45, 0.02, 0.9), 5);
      const foodRate = rateFromHistory(history, 'foodHit', profile.food);
      const activityRate = rateFromHistory(history, 'activityHit', profile.activityHit);
      const roadmapRate = rateFromHistory(history, 'roadmapHit', profile.roadmap);
      const historicalAdherence = adherenceScoreFromRates(foodRate, activityRate, roadmapRate);
      const noise = Math.round((random01(userIndex, dayIndex, 8) - 0.5) * 18);
      const recencyBoost = history.slice(-2).some((item) => item.foodHit && item.activityHit) ? 4 : 0;
      const forecastScore = clamp(historicalAdherence + profile.forecastBias + noise + recencyBoost, 8, 96);
      const riskLevel = forecastScore >= 75 ? 'low' : forecastScore >= 55 ? 'medium' : 'high';
      const label = forecastScore >= 75 ? 'likely_on_track' : forecastScore >= 55 ? 'watchlist' : 'recovery_needed';
      const weakest = !foodHit ? 'logging' : !activityHit ? 'activity' : !roadmapHit ? 'consistency' : 'nutrition';

      if (foodHit) {
        foodRows.push(
          {
            user_id: user.id,
            meal_type: 'breakfast',
            logged_at: atUtc(localDate, 7 + Math.floor(random01(userIndex, dayIndex, 31) * 2), Math.floor(random01(userIndex, dayIndex, 32) * 45)),
            quantity: 1,
            unit: 'serving',
            estimated_grams: 240,
            calories: 360 + (userIndex % 5) * 20,
            protein_g: 24 + (userIndex % 4) * 3,
            carbs_g: 42,
            fat_g: 10,
            name: 'Beta seed breakfast',
            source: 'manual_entry',
            notes: 'synthetic beta measurement seed',
          },
          {
            user_id: user.id,
            meal_type: dayOffset % 4 === 0 ? 'lunch' : 'dinner',
            logged_at: atUtc(localDate, dayOffset % 4 === 0 ? 12 : 19, Math.floor(random01(userIndex, dayIndex, 33) * 45)),
            quantity: 1,
            unit: 'serving',
            estimated_grams: 380,
            calories: 610 + (userIndex % 6) * 35,
            protein_g: 35 + (userIndex % 5) * 4,
            carbs_g: 68,
            fat_g: 18,
            name: 'Beta seed main meal',
            source: 'manual_entry',
            notes: 'synthetic beta measurement seed',
          },
        );
      }

      if (activityHit) {
        activityRows.push({
          user_id: user.id,
          activity_type: isGymDay || userIndex % 3 === 0 ? 'strength' : 'walking',
          activity_name: isGymDay || userIndex % 3 === 0 ? 'Beta seed strength session' : 'Beta seed walk',
          duration_min: isGymDay || userIndex % 3 === 0 ? 45 : 25,
          calories_burned: isGymDay || userIndex % 3 === 0 ? 210 : 95,
          logged_at: atUtc(localDate, 17 + Math.floor(random01(userIndex, dayIndex, 34) * 3), Math.floor(random01(userIndex, dayIndex, 35) * 50)),
          notes: 'synthetic beta measurement seed',
        });
      }

      roadmapRows.push({
        user_id: user.id,
        logged_date: localDate,
        task_id: `beta-seed-${localDate}-${userIndex}`,
        task_title: isGymDay || userIndex % 3 === 0 ? 'Strength session' : 'Walk after work',
        activity_type: isGymDay || userIndex % 3 === 0 ? 'strength' : 'walking',
        duration_min: isGymDay || userIndex % 3 === 0 ? 45 : 25,
        estimated_kcal: isGymDay || userIndex % 3 === 0 ? 210 : 95,
        is_custom: false,
        is_removed: false,
        is_completed: roadmapHit,
      });

      reminderRows.push({
        user_id: user.id,
        token: `beta-seed-token-${String(userIndex + 1).padStart(2, '0')}`,
        meal_type: dayOffset % 3 === 0 ? 'breakfast' : 'dinner',
        local_date: localDate,
        sent_at: atUtc(localDate, dayOffset % 3 === 0 ? 7 : 18, 30),
        opened_at: reminderOpen ? atUtc(localDate, dayOffset % 3 === 0 ? 7 : 18, 35) : null,
        acted_at: reminderAct ? atUtc(localDate, dayOffset % 3 === 0 ? 7 : 18, 50) : null,
        acted_action_type: reminderAct ? (dayOffset % 2 === 0 ? 'food_log' : 'activity_log') : null,
      });

      forecastRows.push({
        user_id: user.id,
        local_date: localDate,
        source: 'today',
        forecast_score: forecastScore,
        forecast_label: label,
        risk_level: riskLevel,
        confidence: history.length >= 14 ? 'high' : 'medium',
        health_score_overall: clamp(forecastScore + (foodHit ? 4 : -8), 0, 100),
        adherence_score: clamp(forecastScore + (roadmapHit ? 2 : -10), 0, 100),
        weakest_area: weakest,
        forecast: {
          score: forecastScore,
          label,
          risk_level: riskLevel,
          seed_profile: profile.name,
          simulated_from: 'rolling_7_day_history',
          historical_adherence: historicalAdherence,
        },
        health_score: {
          overall: clamp(forecastScore + (foodHit ? 4 : -8), 0, 100),
          consistency: clamp(forecastScore + (roadmapHit ? 4 : -12), 0, 100),
          activity: activityHit ? 80 : 35,
          nutrition: foodHit ? 78 : 42,
        },
      });

      const interventionType = weakest === 'activity'
        ? 'walk_reminder'
        : weakest === 'logging'
          ? 'breakfast_prompt'
          : weakest === 'consistency'
            ? 'recovery_plan'
            : 'protein_nudge';
      const mode = forecastScore < 45 ? 'high_risk_intervention' : forecastScore < 65 ? 'recovery_plan' : 'light_nudge';
      const primaryAction = interventionType === 'walk_reminder'
        ? 'add_activity'
        : interventionType === 'breakfast_prompt'
          ? 'log_meal'
          : interventionType === 'protein_nudge'
            ? 'log_protein'
            : 'review_plan';
      const interventionLift = interventionType === 'protein_nudge'
        ? 0.18
        : interventionType === 'walk_reminder'
          ? 0.1
          : interventionType === 'breakfast_prompt'
            ? -0.02
            : 0.08;
      const acted = deterministicHit(userIndex, dayIndex, clamp(profile.action + trendBoost + interventionLift - fatiguePenalty * 0.35, 0.02, 0.92), 6);

      interventionRows.push({
        user_id: user.id,
        intervention_type: interventionType,
        mode,
        priority: forecastScore < 45 ? 'high' : forecastScore < 65 ? 'medium' : 'low',
        primary_action: primaryAction,
        event_type: 'shown',
        source: 'today',
        forecast_score: forecastScore,
        intervention_generated_at: atUtc(localDate, 9, 0),
        metadata: { seed_profile: profile.name, local_date: localDate, simulated: true },
        created_at: atUtc(localDate, 9, 2),
      });
      interventionRows.push({
        user_id: user.id,
        intervention_type: interventionType,
        mode,
        priority: forecastScore < 45 ? 'high' : forecastScore < 65 ? 'medium' : 'low',
        primary_action: primaryAction,
        event_type: acted ? 'acted' : 'dismissed',
        source: 'today',
        forecast_score: forecastScore,
        intervention_generated_at: atUtc(localDate, 9, 0),
        metadata: { seed_profile: profile.name, local_date: localDate, simulated: true },
        created_at: atUtc(localDate, 9, acted ? 22 : 35),
      });

      history.push({ foodHit, activityHit, roadmapHit, reminderOpen, reminderAct, forecastScore });
    }
  });

  return { foodRows, activityRows, roadmapRows, reminderRows, forecastRows, interventionRows };
}

async function main() {
  if (USER_COUNT < 10 || USER_COUNT > 30) {
    throw new Error('BETA_SEED_USERS must be between 10 and 30.');
  }
  if (DAYS !== 30) {
    throw new Error('BETA_SEED_DAYS should stay 30 for comparable beta measurement checks.');
  }

  console.log(`Seeding synthetic beta cohort: ${USER_COUNT} users x ${DAYS} days`);
  const emails = Array.from({ length: USER_COUNT }, (_, idx) => `beta.seed+${String(idx + 1).padStart(2, '0')}@${EMAIL_DOMAIN}`);
  const authUsers = [];
  for (let i = 0; i < emails.length; i += 1) {
    authUsers.push(await createOrFindAuthUser(emails[i], i + 1));
  }

  const users = cohortUsers(authUsers);
  await upsertRows('users', users, 'id', 100);
  const ids = users.map((user) => user.id);

  console.log('Replacing synthetic measurement rows for cohort users...');
  for (const table of [
    'user_intervention_events',
    'behavior_forecast_snapshots',
    'reminder_notification_log',
    'user_daily_roadmap',
    'activity_logs',
    'food_logs',
  ]) {
    await deleteForUserIds(table, ids);
  }

  const rows = buildRows(users);
  await insertRows('food_logs', rows.foodRows);
  await insertRows('activity_logs', rows.activityRows);
  await insertRows('user_daily_roadmap', rows.roadmapRows);
  await upsertRows('reminder_notification_log', rows.reminderRows, 'user_id,token,meal_type,local_date');
  await upsertRows('behavior_forecast_snapshots', rows.forecastRows, 'user_id,local_date,source');
  await insertRows('user_intervention_events', rows.interventionRows);

  const [
    calibration,
    accuracy,
    interventions,
    fatigue,
    engagement,
  ] = await Promise.all([
    select('beta_forecast_calibration', '?select=*&order=bucket_order.asc'),
    select('beta_forecast_accuracy_weekly', '?select=snapshot_id&local_date=lte.' + addDays(todayKey(), -7)),
    select('beta_intervention_performance_30d', '?select=intervention_type,shown,acted,dismissed,action_rate,dismiss_rate,sample_status&order=shown.desc&limit=10'),
    select('beta_reminder_fatigue_weekly', '?select=user_id,week_start,open_rate,action_rate,fatigue_flag&order=week_start.desc&limit=10'),
    select('beta_daily_engagement_30d', '?select=local_date,user_id,food_logs,activity_logs,roadmap_completed,interventions_shown,interventions_acted,forecast_snapshots&local_date=gte.' + addDays(todayKey(), -6)),
  ]);

  const engagementUsers = new Set(engagement.filter((row) => (
    Number(row.food_logs) > 0
    || Number(row.activity_logs) > 0
    || Number(row.roadmap_completed) > 0
    || Number(row.interventions_acted) > 0
  )).map((row) => row.user_id));

  console.log(JSON.stringify({
    cohort_users: users.length,
    inserted: {
      food_logs: rows.foodRows.length,
      activity_logs: rows.activityRows.length,
      roadmap_tasks: rows.roadmapRows.length,
      reminder_logs: rows.reminderRows.length,
      forecast_snapshots: rows.forecastRows.length,
      intervention_events: rows.interventionRows.length,
    },
    verification: {
      forecast_completed_samples: accuracy.length,
      calibration_buckets: calibration,
      top_interventions: interventions,
      reminder_fatigue_rows_sample: fatigue.length,
      active_users_7d: engagementUsers.size,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
