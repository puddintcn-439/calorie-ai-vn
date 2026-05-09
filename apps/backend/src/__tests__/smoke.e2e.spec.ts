import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../app.module';

/**
 * Smoke Test Suite
 * Validates end-to-end Sprint 2 feature flow:
 * 1. Health check
 * 2. Register + login user
 * 3. Set user profile + calculate calorie target
 * 4. Fetch recommendations
 * 5. Log food entry
 * 6. Apply weekly adjustment
 * 7. Verify insights
 */
describe('Smoke Tests - Sprint 2 Feature Flow', () => {
  let app: INestApplication;
  let testUserId: string;
  let testAuthToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('healthy');
      expect(res.body.database.status).toBe('connected');
    });

    it('GET /health/ready should indicate readiness', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body.ready).toBe(true);
    });

    it('GET /health/live should indicate liveness', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body.alive).toBe(true);
    });
  });

  describe('2. User Registration & Authentication', () => {
    it('POST /auth/register should create new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `smoke-test-${Date.now()}@example.com`,
          password: 'Test123!@#',
        })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      testAuthToken = res.body.access_token;
      testUserId = res.body.user.id;
    });

    it('POST /auth/login should authenticate user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `smoke-test-${Date.now()}@example.com`,
          password: 'Test123!@#',
        })
        .expect(200);

      expect(res.body.access_token).toBeDefined();
    });
  });

  describe('3. Profile & Calorie Target Calculation', () => {
    it('PUT /user/profile should update user profile', async () => {
      const res = await request(app.getHttpServer())
        .put('/user/profile')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          weight_kg: 70,
          height_cm: 175,
          age: 30,
          gender: 'male',
          activity_level: 'moderate',
          goal: 'maintain',
        })
        .expect(200);

      expect(res.body.daily_calorie_target).toBeDefined();
    });

    it('POST /calorie-target/calculate should return daily target', async () => {
      const res = await request(app.getHttpServer())
        .post('/calorie-target/calculate')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          weight_kg: 70,
          height_cm: 175,
          age: 30,
          gender: 'male',
          activity_level: 'moderate',
          goal: 'maintain',
        })
        .expect(201);

      expect(res.body.daily_calorie_target).toBeDefined();
      expect(res.body.bmr).toBeGreaterThan(1000);
      expect(res.body.tdee).toBeGreaterThan(1000);
      expect(res.body.target_breakfast_cal).toBeGreaterThan(0);
    });
  });

  describe('4. Recommendations', () => {
    it('GET /calorie-target/recommendations/me should return meal recommendations', async () => {
      const res = await request(app.getHttpServer())
        .get('/calorie-target/recommendations/me')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .expect(200);

      expect(res.body.meals).toBeDefined();
      expect(Array.isArray(res.body.meals)).toBe(true);
      expect(res.body.daily_target).toBeGreaterThan(0);
    });
  });

  describe('5. Food Logging', () => {
    it('POST /log should log food entry with calories', async () => {
      const res = await request(app.getHttpServer())
        .post('/log')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .send({
          food_name: 'Chicken breast',
          calories: 150,
          protein_g: 25,
          carbs_g: 0,
          fat_g: 3,
          meal_type: 'breakfast',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.calories).toBe(150);
    });
  });

  describe('6. Weekly Adjustment', () => {
    it('POST /calorie-target/weekly-adjustment should apply adjustment', async () => {
      const res = await request(app.getHttpServer())
        .post('/calorie-target/weekly-adjustment')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .expect(200);

      expect(res.body.adjusted_daily_target).toBeDefined();
      expect(res.body.adherence_last_week).toBeDefined();
      expect(res.body.recommendation).toBeDefined();
    });
  });

  describe('7. Weekly Insights', () => {
    it('GET /insights/week should return weekly summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/insights/week')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .expect(200);

      expect(res.body.average_daily_calories).toBeDefined();
      expect(res.body.adherence_percentage).toBeDefined();
      expect(res.body.daily_breakdown).toBeDefined();
    });
  });

  describe('8. Integration Validation', () => {
    it('Should have consistent data flow from profile to insights', async () => {
      // Fetch profile
      const profileRes = await request(app.getHttpServer())
        .get('/user/profile')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .expect(200);

      const dailyTarget = profileRes.body.daily_calorie_target;

      // Fetch insights
      const insightsRes = await request(app.getHttpServer())
        .get('/insights/week')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .expect(200);

      // Verify insights use profile's daily target
      expect(insightsRes.body.target_daily_calories).toBe(dailyTarget);
    });
  });
});
