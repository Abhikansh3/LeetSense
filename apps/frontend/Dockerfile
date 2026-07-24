# ---- Build stage ----
FROM node:22-slim AS build
RUN npm install -g pnpm@10.18.3
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/frontend ./apps/frontend
# Baked in at build time; point at the public API URL for your deployment.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @leetsense/frontend build

# ---- Runtime stage (Next standalone) ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public

EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/frontend/server.js"]
