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
  private logStream?: fs.WriteStream;
  private fileLoggingDisabled = false;
  private readonly logsDir = process.env.LOGS_DIR || './logs';

  constructor(private readonly metricsService: MetricsService) {
    this.initializeFileLogging();
  }

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const logStream = this.logStream;
    const metricsService = this.metricsService;
    const middleware = this;

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

      if (logStream && !middleware.fileLoggingDisabled) {
        logStream.write(JSON.stringify(log) + '\n');
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

  private initializeFileLogging(): void {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      const logFilePath = path.join(
        this.logsDir,
        `requests-${new Date().toISOString().split('T')[0]}.jsonl`,
      );
      this.logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
      this.logStream.on('error', (err) => {
        this.fileLoggingDisabled = true;
        this.logStream?.destroy();
        this.logStream = undefined;
        console.error('Request file logging disabled:', err.message);
      });
    } catch (err) {
      this.fileLoggingDisabled = true;
      const message = err instanceof Error ? err.message : String(err);
      console.error('Request file logging disabled:', message);
    }
  }
}
