# Multi-stage build for backend

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for dependency caching
COPY package*.json ./
COPY turbo.json ./
COPY packages/types/package*.json ./packages/types/
COPY apps/backend/package*.json ./apps/backend/

# Install dependencies
RUN npm ci

# Copy sources and build shared package + backend
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=backend

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package.json files
COPY package*.json ./
COPY turbo.json ./
COPY packages/types/package*.json ./packages/types/
COPY apps/backend/package*.json ./apps/backend/

# Copy built backend from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start backend
CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]
