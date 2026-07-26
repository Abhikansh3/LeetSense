# ---- Build stage ----
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.18.3
WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile

# Copy sources and build.
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN pnpm --filter @leetsense/db db:generate
RUN pnpm --filter @leetsense/backend build

# ---- Runtime stage ----
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.18.3
WORKDIR /app
ENV NODE_ENV=production

# pnpm puts a workspace's own dependencies in that workspace's node_modules as
# symlinks into the root .pnpm store — the root node_modules holds only the
# store and the root package's own deps. Both halves are needed or nothing the
# backend imports resolves: `Cannot find package 'dotenv'`. The symlinks are
# relative, so they resolve as long as the two trees land in the same layout.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Pushes the schema then starts the API. Used by hosts that have no separate
# release/migration step; chmod here rather than relying on the checked-in
# file mode surviving every checkout.
COPY apps/backend/docker-entrypoint.sh ./apps/backend/docker-entrypoint.sh
RUN chmod +x ./apps/backend/docker-entrypoint.sh

EXPOSE 3000
# The command is overridden per-service (API vs worker) in docker-compose.
CMD ["node", "apps/backend/dist/index.js"]
