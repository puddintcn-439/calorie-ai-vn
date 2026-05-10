import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { MetricsService } from '../common/metrics/metrics.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthService,
    private metrics: MetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Application health status and readiness probe' })
  async getHealth() {
    return this.health.getStatus();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe for load balancer' })
  async getReadiness() {
    return this.health.checkReadiness();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe for container orchestration' })
  async getLiveness() {
    return this.health.checkLiveness();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Application metrics snapshot for alerting and dashboards' })
  getMetrics() {
    return this.metrics.getSnapshot();
  }
}
