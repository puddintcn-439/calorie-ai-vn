(async () => {
  try {
    const base = 'http://localhost:3000';
    const now = new Date();
    const email = `test-${now.toISOString().replace(/[^0-9]/g, '').slice(0,14)}@example.com`;
    const password = 'Test123!@#';
    console.log('Registering', email);

    const regRes = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const regJson = await regRes.json();
    console.log('register status', regRes.status, regJson);

    const token = regJson?.access_token;
    if (!token) {
      console.error('No access_token received. Exiting.');
      process.exit(1);
    }

    const profile = {
      weight_kg: 75,
      height_cm: 175,
      age: 30,
      gender: 'male',
      activity_level: 'moderate',
      goal: 'lose_weight',
      goal_plan: {
        target_kg: 3,
        duration_weeks: 8,
        direction: 'loss',
        start_date: now.toISOString().split('T')[0],
        end_date: new Date(now.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    };

    console.log('Patching profile with goal_plan...');
    const patchRes = await fetch(`${base}/user/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(profile),
    });
    const patchJson = await patchRes.json();
    console.log('patch status', patchRes.status, patchJson);

    console.log('Fetching profile...');
    const getRes = await fetch(`${base}/user/profile`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const getJson = await getRes.json();
    console.log('get status', getRes.status, getJson);

    console.log('\n=> daily_calorie_target:', getJson.daily_calorie_target);
    console.log('=> goal_plan:', JSON.stringify(getJson.goal_plan, null, 2));
  } catch (e) {
    console.error('Error during test:', e);
    process.exit(1);
  }
})();
