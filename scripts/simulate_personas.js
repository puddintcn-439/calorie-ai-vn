#!/usr/bin/env node
// Simple 12-week persona simulator for calorie/TDEE adaptive flow
// Run: node scripts/simulate_personas.js

const WEEKS = 12;
const WEEKLY_CHANGE_CAP = 150; // kcal/week
const MAX_DEFICIT_PCT = 0.2; // 20%
const MIN_CALORIES = 1200;
const KG_PER_KCAL = 1 / 7700;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(min=0, max=1) { return Math.random() * (max-min) + min; }
function randRangePct(pct=0.05) { return rand(-pct, pct); }

function bmrMifflin({weight, height, age, sex}){
  return 10*weight + 6.25*height - 5*age + (sex === 'male' ? 5 : -161);
}

function bmrKatch({weight, bodyFatPct}){
  if (!Number.isFinite(bodyFatPct)) return null;
  const lean = weight * (1 - (bodyFatPct/100));
  return 370 + 21.6 * lean;
}

const ACTIVITY = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_FACTOR = {
  lose_weight: 0.8,
  maintain: 1.0,
  gain_muscle: 1.1,
  gain_weight: 1.1,
  recomp: 0.92,
};

const PROTEIN_G_PER_KG = {
  lose_weight: 1.6,
  maintain: 1.6,
  gain_muscle: 1.9,
  gain_weight: 1.6,
  recomp: 1.9,
};

const SESSIONS_PER_WEEK = {
  lose_weight: 3,
  maintain: 2,
  gain_muscle: 4,
  gain_weight: 3,
  recomp: 4,
};

function estimateBMR(person){
  const katch = (person.bodyFatPct != null) ? bmrKatch(person) : null;
  if (katch && Number.isFinite(katch)) return katch;
  return bmrMifflin(person);
}

function simulatePersona(person){
  let weight = person.weight;
  let previousTarget = null;
  const weeklyLogs = [];

  for(let week=1; week<=WEEKS; week++){
    const bmr = estimateBMR({...person, weight});
    const activityFactor = ACTIVITY[person.activity] ?? ACTIVITY.sedentary;
    const trueTdee = bmr * activityFactor;
    const goalFactor = GOAL_FACTOR[person.goal] ?? 1.0;

    const rawTarget = trueTdee * goalFactor;
    const minAllowed = Math.max(MIN_CALORIES, trueTdee * (1 - MAX_DEFICIT_PCT));
    let target = Math.max(minAllowed, rawTarget);

    if (!previousTarget) previousTarget = target;

    // macros / training: compute protein target and simulate intake
    const proteinPerKg = PROTEIN_G_PER_KG[person.goal] ?? 1.6;
    const proteinTargetG = Math.round(proteinPerKg * weight);
    const proteinIntakeG = Math.max(0, Math.round(proteinTargetG * (person.proteinAdherence ?? 0.9) * (1 + randRangePct(0.1))));
    const proteinAdequacy = clamp(proteinIntakeG / Math.max(1, proteinTargetG), 0, 2);

    // training sessions
    const plannedSessions = SESSIONS_PER_WEEK[person.goal] ?? 2;
    const sessionsCompleted = Math.max(0, Math.round(plannedSessions * (person.trainingAdherence ?? 0.7) + randRangePct(0.2) * plannedSessions));
    const trainingEffectiveness = plannedSessions > 0 ? clamp(sessionsCompleted / plannedSessions, 0, 1) : 0;

    // simulate daily intake for the week with some noise
    const daily = [];
    for(let d=0; d<7; d++){
      const noise = randRangePct(0.05); // +/-5%
      const dayCal = Math.max(800, Math.round(target * person.adherence * (1 + noise)));
      daily.push(dayCal);
    }
    const avgCalories = daily.reduce((a,b)=>a+b,0)/daily.length;

    // weight change predicted by energy balance
    const predictedWeeklyKg = (avgCalories - trueTdee) * 7 / 7700;

    // estimate lean vs fat change using protein & training
    let leanChangeKg = 0;
    let fatChangeKg = 0;
    if (predictedWeeklyKg > 0) {
      const leanShare = clamp(0.5 * (trainingEffectiveness * proteinAdequacy), 0.05, 0.9);
      leanChangeKg = predictedWeeklyKg * leanShare;
      fatChangeKg = predictedWeeklyKg - leanChangeKg;
    } else {
      const leanLossShare = clamp(0.25 * (1 - (trainingEffectiveness * proteinAdequacy)) + 0.05, 0.05, 0.9);
      leanChangeKg = predictedWeeklyKg * leanLossShare; // negative
      fatChangeKg = predictedWeeklyKg - leanChangeKg; // more negative
    }

    // measurement noise in recorded weight change (water/scale) up to +/-0.25kg
    const measuredNoise = rand(-0.25, 0.25);
    const recordedWeeklyKg = predictedWeeklyKg + measuredNoise;

    // actual TDEE inferred (ActualTDEE primary formula)
    const actualTdee = avgCalories - (7700 * recordedWeeklyKg / 7);

    // new target candidate from actualTdee
    let candidateTarget = actualTdee * goalFactor;

    // limit change per week
    const delta = clamp(candidateTarget - previousTarget, -WEEKLY_CHANGE_CAP, WEEKLY_CHANGE_CAP);
    let newTarget = previousTarget + delta;

    // clamp to minAllowed
    let clampReason = null;
    if (newTarget < minAllowed){
      newTarget = minAllowed;
      clampReason = 'min_deficit_clamp';
    } else if (Math.abs(delta) === WEEKLY_CHANGE_CAP){
      clampReason = 'weekly_change_cap';
    }

    // update weight by recorded measurement
    weight = +(weight + recordedWeeklyKg).toFixed(3);

    weeklyLogs.push({
      week,
      weight: +weight.toFixed(2),
      avgCalories: Math.round(avgCalories),
      trueTdee: Math.round(trueTdee),
      actualTdee: Math.round(actualTdee),
      proteinTargetG,
      proteinIntakeG,
      sessionsCompleted,
      trainingEffectiveness: +trainingEffectiveness.toFixed(2),
      leanChangeKg: +leanChangeKg.toFixed(3),
      fatChangeKg: +fatChangeKg.toFixed(3),
      prevTarget: Math.round(previousTarget),
      newTarget: Math.round(newTarget),
      clampReason,
      recordedWeeklyKg: +recordedWeeklyKg.toFixed(3),
    });

    previousTarget = newTarget;
  }

  const start = person.weight;
  const end = weeklyLogs[weeklyLogs.length-1].weight;
  const deltaKg = +(end - start).toFixed(2);
  const achieved = (person.desiredChangeKg != null)
    ? Math.abs(deltaKg) >= Math.abs(person.desiredChangeKg) || (Math.sign(deltaKg) === Math.sign(person.desiredChangeKg) && Math.abs(deltaKg) >= Math.abs(person.desiredChangeKg)*0.6)
    : null;

  return {person, start, end, deltaKg, achieved, weeklyLogs};
}

function printSummary(result){
  const {person, start, end, deltaKg, achieved, weeklyLogs} = result;
  console.log('\n===', person.name, '===');
  console.log(`Start: ${start} kg → End: ${end} kg  (Δ ${deltaKg} kg)`);
  if (person.desiredChangeKg != null){
    console.log(`Goal: ${person.desiredChangeKg > 0 ? '+' : ''}${person.desiredChangeKg} kg — Achieved? ${achieved ? 'Likely' : 'Not yet'}`);
  }
  console.log('Sample weeks: first / last');
  const first = weeklyLogs[0];
  const last = weeklyLogs[weeklyLogs.length-1];
  console.log('W1:', first);
  console.log('W12:', last);
}

const personas = [
  {
    name: 'Người béo: giảm 5kg', sex: 'male', age: 38, height: 175, weight: 95, bodyFatPct: 32,
    activity: 'sedentary', goal: 'lose_weight', desiredChangeKg: -5, adherence: 0.88
  },
  {
    name: 'Người gầy: tăng 3kg', sex: 'female', age: 26, height: 165, weight: 55, bodyFatPct: 18,
    activity: 'lightly_active', goal: 'gain_weight', desiredChangeKg: 3, adherence: 0.9
  },
  {
    name: 'Người mỏng: tăng cơ +3kg', sex: 'male', age: 24, height: 178, weight: 62, bodyFatPct: 12,
    activity: 'active', goal: 'gain_muscle', desiredChangeKg: 3, adherence: 0.92
  },
  {
    name: 'Người béo: tăng cơ & giảm mỡ (recomp)', sex: 'male', age: 42, height: 170, weight: 95, bodyFatPct: 34,
    activity: 'moderately_active', goal: 'recomp', desiredChangeKg: -2, adherence: 0.85
  },
  {
    name: 'Người cân đối: giữ dáng', sex: 'male', age: 30, height: 175, weight: 70, bodyFatPct: 18,
    activity: 'moderately_active', goal: 'maintain', desiredChangeKg: 0, adherence: 0.95
  }
];

function runAll(){
  console.log('Running', WEEKS, 'week simulations for', personas.length, 'personas...');
  const results = personas.map(p => simulatePersona(p));
  results.forEach(r => printSummary(r));
  // return results for programmatic use
  return results;
}

if (require.main === module){
  runAll();
}
