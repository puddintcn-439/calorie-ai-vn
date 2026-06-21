import { ConfigService } from '@nestjs/config';
import { AiQueueService } from '../ai.queue.service';

describe('AiQueueService', () => {
  it('serializes provider calls when concurrency is configured as one', async () => {
    const config = {
      get: jest.fn(() => 1),
    } as unknown as ConfigService;
    const queue = new AiQueueService(config);
    let releaseFirst: (() => void) | undefined;
    let active = 0;
    let maxActive = 0;

    const first = queue.execute('first', async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      active -= 1;
      return 'first';
    });
    const second = queue.execute('second', async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      active -= 1;
      return 'second';
    });

    await Promise.resolve();
    expect(active).toBe(1);
    expect(maxActive).toBe(1);
    releaseFirst?.();

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(maxActive).toBe(1);
  });
});
