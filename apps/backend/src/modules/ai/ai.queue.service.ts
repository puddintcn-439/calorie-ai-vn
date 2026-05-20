import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Job<T> = {
  opName: string;
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

@Injectable()
export class AiQueueService {
  private readonly logger = new Logger(AiQueueService.name);
  private readonly queue: Job<unknown>[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(private config: ConfigService) {
    this.concurrency = Number(this.config.get('AI_PROVIDER_MAX_CONCURRENCY') ?? 3);
    this.logger.debug(`[AiQueueService] concurrency=${this.concurrency}`);
  }

  async execute<T>(opName: string, fn: () => Promise<T>): Promise<T> {
    if (this.concurrency <= 1) {
      this.logger.debug(`[AiQueue] executing inline ${opName}`);
      return fn();
    }

    if (this.running < this.concurrency) {
      this.running += 1;
      try {
        this.logger.debug(`[AiQueue] start ${opName} running=${this.running}`);
        const r = await fn();
        return r;
      } finally {
        this.running = Math.max(0, this.running - 1);
        this.next();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ opName, fn, resolve, reject });
      this.logger.debug(`[AiQueue] queued ${opName} queue_len=${this.queue.length}`);
    });
  }

  private next(): void {
    if (this.running >= this.concurrency) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running += 1;
    (async () => {
      try {
        this.logger.debug(`[AiQueue] dequeued ${job.opName} running=${this.running}`);
        const result = await job.fn();
        job.resolve(result as any);
      } catch (e) {
        job.reject(e);
      } finally {
        this.running = Math.max(0, this.running - 1);
        this.next();
      }
    })();
  }
}
