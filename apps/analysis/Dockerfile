FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy packages
COPY packages ./packages

# Copy analysis app
COPY apps/analysis ./apps/analysis

# Copy API package.json and source files for TypeScript path resolution
# (analysis service may need types from @crm/api)
COPY apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build packages (in order)
RUN pnpm --filter @crm/cloud-google build
RUN pnpm --filter @crm/shared build
RUN pnpm --filter @crm/database build
RUN pnpm --filter @crm/clients build

# Build analysis app
RUN pnpm --filter @crm/analysis build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy packages
COPY packages ./packages

# Copy analysis app
COPY apps/analysis ./apps/analysis

# Copy API package.json and source files for TypeScript path resolution
COPY apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src

# Install production dependencies only
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod

# Copy built files from base stage
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/analysis/dist ./apps/analysis/dist

# Set working directory to analysis app
WORKDIR /app/apps/analysis

# Expose port
EXPOSE 4002

# Start the service
CMD ["node", "dist/index.js"]
