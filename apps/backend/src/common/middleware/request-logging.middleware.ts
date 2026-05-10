import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MetricsService } from '../metrics/metrics.service';

export interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user_id?: string;
  error?: string;
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private logStream: fs.WriteStream;
  private readonly logsDir = process.env.LOGS_DIR || './logs';

  constructor(private readonly metricsService: MetricsService) {
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Create writable stream for request logs
    const logFilePath = path.join(
      this.logsDir,
      `requests-${new Date().toISOString().split('T')[0]}.jsonl`,
    );
    this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  }

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const logStream = this.logStream;
    const metricsService = this.metricsService;

    // Capture original send
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - startTime;

      const log: RequestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        user_id: (req.user as any)?.id,
      };

      // Write to file as JSON lines format
      try {
        logStream.write(JSON.stringify(log) + '\n');
      } catch (err) {
        console.error('Failed to write request log:', err);
      }

      // Record HTTP metric
      metricsService.recordHttpRequest(res.statusCode);

      // Only log errors and slow requests to console
      if (res.statusCode >= 400 || duration > 1000) {
        console.log(
          `[${log.status}] ${log.method} ${log.path} - ${duration}ms`,
        );
      }

      // Call original send with correct context
      return originalSend.call(this, data);
    };

    next();
  }

  onModuleDestroy() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}
