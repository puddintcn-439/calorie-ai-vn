# Monitoring & Observability Setup

## Overview

This guide configures monitoring stack for production using Prometheus + Grafana + AlertManager.

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Helm 3+

## Installation

### 1. Install Prometheus Stack

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus operator
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values prometheus-values.yaml
```

### 2. Configure ServiceMonitor

Create ServiceMonitor for backend:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: calorie-ai-prod
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### 3. Expose Metrics Endpoint

Add metrics endpoint to backend (NestJS):

```typescript
import { Module } from '@nestjs/common';
import * as prometheusClient from 'prom-client';

@Module({})
export class MetricsModule {
  static register() {
    return {
      module: MetricsModule,
      providers: [
        {
          provide: 'PROMETHEUS_METRICS',
          useValue: prometheusClient,
        },
      ],
    };
  }
}

// In controller:
@Get('metrics')
getMetrics() {
  return prometheusClient.register.metrics();
}
```

### 4. Alert Rules

Create PrometheusRule:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: backend-alerts
  namespace: calorie-ai-prod
spec:
  groups:
  - name: backend.rules
    interval: 30s
    rules:
    - alert: HighErrorRate
      expr: |
        rate(http_requests_total{status=~"5.."}[5m]) > 0.05
      for: 5m
      annotations:
        summary: "High error rate detected"
        description: "Error rate > 5% for 5 minutes"
    
    - alert: HighLatency
      expr: |
        histogram_quantile(0.99, http_request_duration_seconds_bucket) > 1
      for: 5m
      annotations:
        summary: "High API latency detected"
        description: "p99 latency > 1s for 5 minutes"
    
    - alert: PodMemoryUsage
      expr: |
        container_memory_usage_bytes{pod=~"backend.*"} 
        / container_spec_memory_limit_bytes > 0.9
      for: 5m
      annotations:
        summary: "Pod memory usage critical"
        description: "Pod using >90% of memory limit"
```

### 5. Grafana Dashboard

Access Grafana:

```bash
# Port forward
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring

# Login (default: admin / prom-operator)
# Import dashboard: 3662 (Kubernetes Deployment Statefulset Daemonset Metrics)
```

Create custom dashboard for backend:

1. Dashboard: Backend Application Metrics
   - Panels:
     - Request rate (requests/sec)
     - Error rate (%)
     - Latency p50, p95, p99
     - CPU usage
     - Memory usage
     - Database query duration

2. Dashboard: Infrastructure Health
   - Panels:
     - Pod restarts
     - Node CPU/Memory
     - Network I/O
     - Disk usage
     - Pod status

## PagerDuty Integration

### 1. Create Integration Key

In PagerDuty:
1. Services → Backend Service
2. Integrations → Add Integration
3. Select "Prometheus" as integration type
4. Copy Integration Key

### 2. Configure AlertManager

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'pagerduty'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h

receivers:
- name: 'pagerduty'
  pagerduty_configs:
  - service_key: '<YOUR_INTEGRATION_KEY>'
    description: '{{ .GroupLabels.alertname }}'
    details:
      firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
```

Apply:

```bash
kubectl create secret generic alertmanager-config \
  --from-file=alertmanager.yaml \
  -n monitoring
```

## Logging Stack (ELK/Datadog)

### Option 1: Datadog Agent

```bash
# Install Datadog agent
helm repo add datadog https://helm.datadoghq.com
helm install datadog datadog/datadog \
  --set datadog.apiKey=<YOUR_API_KEY> \
  --set datadog.appKey=<YOUR_APP_KEY> \
  --namespace datadog \
  --create-namespace
```

### Option 2: ELK Stack

```bash
# Install Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace

# Install Logstash
helm install logstash elastic/logstash \
  --namespace logging

# Install Kibana
helm install kibana elastic/kibana \
  --namespace logging
```

## Distributed Tracing (Jaeger)

```bash
# Install Jaeger operator
helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
helm install jaeger jaegertracing/jaeger \
  --namespace observability \
  --create-namespace

# Backend instrumentation (manual or OpenTelemetry auto-instrumentation)
```

## Health Check Monitoring

### Custom health dashboard

```bash
# Monitor /health endpoint
kubectl create cronjob health-check --image=curlimages/curl \
  --schedule="*/5 * * * *" \
  -- sh -c 'curl http://backend/health || exit 1'
```

## Logs Retention

Configure log rotation:

```bash
# In pod, configure docker json-driver
docker run --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 backend:latest
```

Or use container-level settings in K8s:

```yaml
resources:
  limits:
    ephemeral-storage: "1Gi"
```

## Alerting Channels

1. **Critical (SEV-1):** PagerDuty → Phone call + SMS
2. **High (SEV-2):** PagerDuty + Slack #incidents
3. **Medium (SEV-3):** Slack #engineering
4. **Low (SEV-4):** Email

## Runbook Links

- Health check failures: [Runbook](../incident-runbook-v1.md#1-health-check-failures)
- Authentication errors: [Runbook](../incident-runbook-v1.md#2-authentication-token-expiration)
- Database issues: [Runbook](../incident-runbook-v1.md)

## Monthly Maintenance

- [ ] Review alert thresholds (adjust false positives/negatives)
- [ ] Validate runbook accuracy (test 1 critical + 1 high alert)
- [ ] Capacity planning (trend CPU/memory growth)
- [ ] Update monitoring dashboards
- [ ] Archive old logs

---

**Contacts:**
- Prometheus Admin: monitoring@calorie-ai.vn
- On-Call Engineer: Check PagerDuty schedule
- Infrastructure: devops@calorie-ai.vn
