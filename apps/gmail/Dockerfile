# Multi-stage build for smaller image size

# Stage 1: Build
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@9.14.2

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages ./packages
COPY apps/gmail ./apps/gmail
# Copy API package.json and source files for TypeScript path resolution (clients package needs @crm/api types)
COPY apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build packages
RUN pnpm --filter @crm/cloud-google build
RUN pnpm --filter @crm/shared build
RUN pnpm --filter @crm/database build
RUN pnpm --filter @crm/clients build

# Build gmail app
RUN pnpm --filter @crm/gmail build

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
COPY apps/gmail/package.json ./apps/gmail/

# Install production dependencies only (--ignore-scripts avoids patch-package requirement)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy built files from builder
COPY --from=builder /app/packages/cloud/google/dist ./packages/cloud/google/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/clients/dist ./packages/clients/dist
COPY --from=builder /app/apps/gmail/dist ./apps/gmail/dist

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 4001

# Start application
CMD ["node", "apps/gmail/dist/index.js"]
