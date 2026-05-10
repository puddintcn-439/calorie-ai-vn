import { LogController } from '../log.controller';
import { LogService } from '../log.service';

describe('LogController', () => {
  let controller: LogController;
  let logService: jest.Mocked<LogService>;

  beforeEach(() => {
    logService = {
      createLog: jest.fn(),
      getDailyLog: jest.fn(),
      deleteLog: jest.fn(),
      getSavedMeals: jest.fn(),
      createSavedMeal: jest.fn(),
      logSavedMeal: jest.fn(),
      deleteSavedMeal: jest.fn(),
      createActivityLog: jest.fn(),
      syncActivityBatch: jest.fn(),
      getActivityLogs: jest.fn(),
      deleteActivityLog: jest.fn(),
    } as unknown as jest.Mocked<LogService>;

    controller = new LogController(logService);
  });

  describe('syncActivities', () => {
    it('forwards sync batch to service with authenticated user id', async () => {
      const dto = {
        source: 'apple_health',
        synced_at: '2026-05-09T00:00:00Z',
        entries: [
          {
            external_id: 'health-1',
            activity_type: 'walking',
            activity_name: 'Morning walk',
            duration_min: 30,
            calories_burned: 120,
            logged_at: '2026-05-09T07:00:00Z',
            steps_count: 4100,
            distance_km: 3.2,
            notes: 'Synced from phone',
          },
        ],
      } as any;

      const expected = {
        source: 'apple_health',
        synced_at: dto.synced_at,
        imported_count: 1,
        skipped_count: 0,
        total_calories_burned: 120,
      };

      logService.syncActivityBatch.mockResolvedValue(expected as any);

      await expect(
        controller.syncActivities(dto, { user: { id: 'user-1' } }),
      ).resolves.toEqual(expected);

      expect(logService.syncActivityBatch).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getActivities', () => {
    it('uses provided date when listing activity logs', async () => {
      logService.getActivityLogs.mockResolvedValue([] as any);

      await controller.getActivities('2026-05-09', { user: { id: 'user-1' } });

      expect(logService.getActivityLogs).toHaveBeenCalledWith('user-1', '2026-05-09', 0);
    });

    it('falls back to today when date query is omitted', async () => {
      logService.getActivityLogs.mockResolvedValue([] as any);

      await controller.getActivities(undefined as any, { user: { id: 'user-1' } });

      expect(logService.getActivityLogs).toHaveBeenCalledWith(
        'user-1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        0,
      );
    });
  });
});