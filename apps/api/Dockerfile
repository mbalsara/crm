# Multi-stage build for smaller image size

# Stage 1: Build
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@9.14.2

WORKDIR /app

# Copy workspace config and package.json files only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/cloud/google/package.json ./packages/cloud/google/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/clients/package.json ./packages/clients/
COPY apps/api/package.json ./apps/api/

# Install dependencies (cached unless package.json files change)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY packages ./packages
COPY apps/api ./apps/api

# Build packages
RUN pnpm --filter @crm/cloud-google build
RUN pnpm --filter @crm/shared build
RUN pnpm --filter @crm/database build
RUN pnpm --filter @crm/clients build

# Build api app
RUN pnpm --filter @crm/api build

# Stage 2: Production
FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm@9.14.2

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/cloud/google/package.json ./packages/cloud/google/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/clients/package.json ./packages/clients/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/packages/cloud/google/dist ./packages/cloud/google/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/clients/dist ./packages/clients/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "apps/api/dist/index.js"]
