# Deployment Guide

## Prerequisites

- Docker & Docker Compose installed (v20+)
- kubectl installed (v1.24+) if deploying to Kubernetes
- GitHub Actions secrets configured (see below)
- SSH access to production servers

## Local Development with Docker

### Using Docker Compose

```bash
# 1. Create .env file with required variables
cat > .env.docker << EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=calorie_ai
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=7d
EOF

# 2. Start services
docker-compose up -d

# 3. Wait for health checks
docker-compose ps

# 4. Verify backend is ready
curl http://localhost:3000/health

# 5. Run smoke tests
docker exec calorie-ai-backend npm run test:e2e -- smoke

# 6. Cleanup
docker-compose down -v
```

### Using Docker Build Directly

```bash
# Build backend image
docker build -t calorie-ai-backend:latest ./apps/backend

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:password@localhost:5432/calorie_ai" \
  -e SUPABASE_URL="https://..." \
  -e SUPABASE_KEY="..." \
  -e JWT_SECRET="..." \
  calorie-ai-backend:latest
```

## Staging Environment Deployment

### 1. Prerequisites Setup

```bash
# Configure kubectl context
kubectl config use-context staging-cluster

# Verify connectivity
kubectl cluster-info

# Create namespace
kubectl create namespace calorie-ai-staging
```

### 2. Deploy via GitHub Actions

```bash
# Push to develop branch triggers automatic staging deployment
git push origin develop

# Monitor deployment
kubectl rollout status deployment/backend -n calorie-ai-staging --watch
```

### 3. Manual Staging Deploy

```bash
# Build and push image
docker build -t ghcr.io/calorie-ai/backend:staging-$(git rev-parse --short HEAD) ./apps/backend
docker push ghcr.io/calorie-ai/backend:staging-$(git rev-parse --short HEAD)

# Apply Kubernetes manifests
kubectl apply -f k8s/staging/deployment.yaml
kubectl apply -f k8s/staging/service.yaml

# Verify rollout
kubectl rollout status deployment/backend -n calorie-ai-staging
```

## Production Environment Deployment

### Pre-Deployment Checklist

- [ ] Code reviewed and merged to main
- [ ] All tests passing (129 unit, 9 E2E, 8 smoke)
- [ ] Database migrations reviewed and tested
- [ ] Secrets rotated
- [ ] Backup verified
- [ ] Monitoring/alerting configured
- [ ] On-call engineer available
- [ ] Runbook updated

### 1. Automated Deployment (Recommended)

```bash
# Push to main branch triggers GitHub Actions CI/CD
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0

# Monitor GitHub Actions
# - CI/CD pipeline runs (lint, test, build)
# - Smoke tests execute
# - Deployment workflow triggers
# - Health checks validate
```

### 2. Blue-Green Deployment

```bash
# Current (Blue) environment is production
# Green environment is new deployment

# Step 1: Deploy to Green environment
kubectl set image deployment/backend-green \
  backend=ghcr.io/calorie-ai/backend:prod-$(git rev-parse --short HEAD) \
  -n calorie-ai-prod

# Step 2: Wait for rollout
kubectl rollout status deployment/backend-green -n calorie-ai-prod --watch

# Step 3: Run smoke tests against green
kubectl run smoke-test-green --image=ghcr.io/calorie-ai/backend:prod-test \
  --env="BACKEND_URL=http://backend-green:3000" \
  -n calorie-ai-prod

# Step 4: Switch traffic (update service selector)
kubectl patch service backend \
  -p '{"spec":{"selector":{"deployment":"backend-green"}}}' \
  -n calorie-ai-prod

# Step 5: Verify new environment
curl https://api.calorie-ai.vn/health

# Step 6: Monitor for 1 hour
# - Check error rates
# - Monitor latency
# - Check logs for errors
# - Monitor resource usage

# Step 7: Keep blue as fallback for 1 hour, then cleanup
kubectl delete deployment backend-blue -n calorie-ai-prod
```

## Rollback Procedure

### Quick Rollback (< 5 minutes downtime)

```bash
# If Green deployment is unhealthy after deployment:

# 1. Switch traffic back to Blue
kubectl patch service backend \
  -p '{"spec":{"selector":{"deployment":"backend-blue"}}}' \
  -n calorie-ai-prod

# 2. Verify traffic is restored
curl https://api.calorie-ai.vn/health

# 3. Investigate issue with Green deployment
kubectl logs deployment/backend-green -n calorie-ai-prod

# 4. Fix and re-deploy when ready
```

### Database Rollback

```bash
# 1. Stop backend service
kubectl scale deployment backend --replicas=0 -n calorie-ai-prod

# 2. Restore database from backup
# Instructions depend on your backup solution:
# - Supabase: Use Point-in-Time Recovery (PITR)
# - Custom: Use pg_dump backup

# 3. Verify database integrity
psql -U postgres -d calorie_ai -c "SELECT COUNT(*) FROM users;"

# 4. Restart backend service
kubectl scale deployment backend --replicas=3 -n calorie-ai-prod

# 5. Verify health
curl https://api.calorie-ai.vn/health
```

## Monitoring & Logging Post-Deployment

### 1. Real-time Logs

```bash
# Stream production logs
kubectl logs -f deployment/backend -n calorie-ai-prod

# Watch specific pod
kubectl logs -f pod/backend-xyz123 -n calorie-ai-prod

# Search logs for errors
kubectl logs deployment/backend -n calorie-ai-prod | grep -i error
```

### 2. Metrics Monitoring

```bash
# Check resource usage
kubectl top nodes
kubectl top pods -n calorie-ai-prod

# Watch deployment rollout
kubectl rollout status deployment/backend -n calorie-ai-prod --watch

# Check events
kubectl get events -n calorie-ai-prod --sort-by='.lastTimestamp'
```

### 3. Health Check

```bash
# Verify all services healthy
for endpoint in health health/ready health/live; do
  echo "Checking /$endpoint..."
  curl -s https://api.calorie-ai.vn/$endpoint | jq .
done
```

## Troubleshooting

### Pod not starting

```bash
# Check pod status
kubectl describe pod backend-xyz -n calorie-ai-prod

# Check logs
kubectl logs backend-xyz -n calorie-ai-prod

# Check resource requests
kubectl get pods backend-xyz -o yaml -n calorie-ai-prod | grep -A 5 resources

# Increase resources if needed
kubectl set resources deployment backend --limits=memory=2Gi,cpu=2 -n calorie-ai-prod
```

### Database connectivity issues

```bash
# Verify database is reachable
psql postgres://user:pass@host:5432/calorie_ai -c "SELECT 1;"

# Check connection string in pod
kubectl exec -it backend-xyz -n calorie-ai-prod -- env | grep DATABASE_URL

# Verify secrets
kubectl get secret database-credentials -n calorie-ai-prod -o yaml
```

### High error rate after deployment

```bash
# 1. Check recent changes
git log --oneline -5

# 2. Rollback if needed (see Rollback section above)

# 3. Investigate specific errors
kubectl logs deployment/backend -n calorie-ai-prod | grep ERROR | head -20

# 4. Check smoke test results in CI/CD logs
```

## Maintenance Tasks

### Database Maintenance

```bash
# Weekly: Analyze query performance
psql calorie_ai -c "ANALYZE;"

# Monthly: Vacuum and reindex
psql calorie_ai -c "VACUUM ANALYZE;"
psql calorie_ai -c "REINDEX DATABASE calorie_ai;"

# Check table sizes
psql calorie_ai -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema') 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### Backup Verification

```bash
# Daily: Verify backups exist
ls -lah /backups/calorie_ai/

# Weekly: Test restore process
# - Restore to staging database
# - Verify data integrity
# - Document recovery time

# Monthly: Full backup test
# - Restore complete backup
# - Run smoke tests
# - Verify all data
```

### Certificate Management

```bash
# 30 days before expiry: Renew TLS certificate
certbot renew --force-renewal

# Verify certificate
openssl x509 -in /etc/letsencrypt/live/api.calorie-ai.vn/cert.pem -text -noout

# Update Kubernetes secret
kubectl create secret tls api-tls \
  --cert=/etc/letsencrypt/live/api.calorie-ai.vn/fullchain.pem \
  --key=/etc/letsencrypt/live/api.calorie-ai.vn/privkey.pem \
  -n calorie-ai-prod \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Contacts & Escalation

- **On-Call Engineer:** Check PagerDuty for current schedule
- **Database Support:** DBA Team @ ops-team@calorie-ai.vn
- **Infrastructure:** DevOps Team @ devops@calorie-ai.vn
- **Incident Response:** #incidents Slack channel
