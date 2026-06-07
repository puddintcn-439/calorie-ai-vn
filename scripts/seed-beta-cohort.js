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
const USER_COUNT = Number(process.env.BETA_SEED_USERS || 24);
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
  const goals = ['lose_weight', 'maintain', 'gain_muscle'];
  const activity = ['light', 'moderate', 'active', 'very_active'];
  return authUsers.map((user, idx) => {
    const target = 1750 + (idx % 6) * 120;
    return {
      id: user.id,
      email: user.email,
      full_name: `Beta Seed User ${String(idx + 1).padStart(2, '0')}`,
      weight_kg: 55 + (idx % 9) * 4,
      height_cm: 158 + (idx % 8) * 5,
      age: 22 + (idx % 22),
      gender: idx % 2 === 0 ? 'female' : 'male',
      activity_level: activity[idx % activity.length],
      goal: goals[idx % goals.length],
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
    { name: 'consistent_high', base: 88, food: 0.93, activity: 0.75, roadmap: 0.86, open: 0.82, action: 0.62 },
    { name: 'steady_medium', base: 72, food: 0.78, activity: 0.55, roadmap: 0.72, open: 0.68, action: 0.42 },
    { name: 'overconfident_risk', base: 84, food: 0.42, activity: 0.28, roadmap: 0.38, open: 0.34, action: 0.18 },
    { name: 'underconfident_improver', base: 45, food: 0.86, activity: 0.62, roadmap: 0.82, open: 0.78, action: 0.55 },
    { name: 'low_engagement', base: 32, food: 0.25, activity: 0.16, roadmap: 0.28, open: 0.26, action: 0.1 },
    { name: 'weekend_drop', base: 66, food: 0.7, activity: 0.5, roadmap: 0.58, open: 0.58, action: 0.3 },
  ];
  return profiles[index % profiles.length];
}

function deterministicHit(userIndex, dayOffset, threshold, salt = 0) {
  const raw = ((userIndex + 3) * 37 + (dayOffset + 11) * 19 + salt * 23) % 100;
  return raw < Math.round(threshold * 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    for (let dayOffset = 0; dayOffset < DAYS; dayOffset += 1) {
      const localDate = addDays(baseDate, -dayOffset);
      const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
      const weekendPenalty = profile.name === 'weekend_drop' && (day === 0 || day === 6) ? -0.28 : 0;
      const foodHit = deterministicHit(userIndex, dayOffset, clamp(profile.food + weekendPenalty, 0.05, 0.98), 1);
      const activityHit = deterministicHit(userIndex, dayOffset, clamp(profile.activity + weekendPenalty / 2, 0.05, 0.95), 2);
      const roadmapHit = deterministicHit(userIndex, dayOffset, clamp(profile.roadmap + weekendPenalty, 0.05, 0.98), 3);
      const reminderOpen = deterministicHit(userIndex, dayOffset, clamp(profile.open + weekendPenalty, 0.03, 0.95), 4);
      const reminderAct = reminderOpen && deterministicHit(userIndex, dayOffset, clamp(profile.action + weekendPenalty, 0.02, 0.9), 5);
      const noise = ((userIndex * 7 + dayOffset * 5) % 13) - 6;
      const forecastScore = clamp(profile.base + noise + (dayOffset < 7 ? 4 : 0), 8, 96);
      const riskLevel = forecastScore >= 75 ? 'low' : forecastScore >= 55 ? 'medium' : 'high';
      const label = forecastScore >= 75 ? 'likely_on_track' : forecastScore >= 55 ? 'watchlist' : 'recovery_needed';
      const weakest = !foodHit ? 'logging' : !activityHit ? 'activity' : !roadmapHit ? 'consistency' : 'nutrition';

      if (foodHit) {
        foodRows.push(
          {
            user_id: user.id,
            meal_type: 'breakfast',
            logged_at: atUtc(localDate, 8, 10),
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
            logged_at: atUtc(localDate, dayOffset % 4 === 0 ? 12 : 19, 5),
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
          activity_type: userIndex % 3 === 0 ? 'strength' : 'walking',
          activity_name: userIndex % 3 === 0 ? 'Beta seed strength session' : 'Beta seed walk',
          duration_min: userIndex % 3 === 0 ? 45 : 25,
          calories_burned: userIndex % 3 === 0 ? 210 : 95,
          logged_at: atUtc(localDate, 18, 15),
          notes: 'synthetic beta measurement seed',
        });
      }

      roadmapRows.push({
        user_id: user.id,
        logged_date: localDate,
        task_id: `beta-seed-${localDate}-${userIndex}`,
        task_title: userIndex % 3 === 0 ? 'Strength session' : 'Walk after work',
        activity_type: userIndex % 3 === 0 ? 'strength' : 'walking',
        duration_min: userIndex % 3 === 0 ? 45 : 25,
        estimated_kcal: userIndex % 3 === 0 ? 210 : 95,
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
        confidence: dayOffset < 14 ? 'medium' : 'high',
        health_score_overall: clamp(forecastScore + (foodHit ? 4 : -8), 0, 100),
        adherence_score: clamp(forecastScore + (roadmapHit ? 2 : -10), 0, 100),
        weakest_area: weakest,
        forecast: {
          score: forecastScore,
          label,
          risk_level: riskLevel,
          seed_profile: profile.name,
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
      const acted = deterministicHit(userIndex, dayOffset, clamp(profile.action + (forecastScore < 45 ? 0.08 : 0), 0.02, 0.9), 6);

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
        metadata: { seed_profile: profile.name, local_date: localDate },
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
        metadata: { seed_profile: profile.name, local_date: localDate },
        created_at: atUtc(localDate, 9, acted ? 22 : 35),
      });
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
