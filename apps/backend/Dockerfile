# Multi-stage build for backend

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy workspace packages
COPY packages ./packages
COPY apps/backend ./apps/backend

# Install dependencies
RUN npm ci

# Build backend
RUN npm run build --workspace=backend

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package.json files
COPY package*.json ./
COPY turbo.json ./

# Copy packages (types)
COPY packages ./packages

# Copy built backend from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package*.json ./apps/backend/

# Install production dependencies only
RUN cd apps/backend && npm ci --only=production && npm cache clean --force

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
CMD ["node", "apps/backend/dist/main"]
