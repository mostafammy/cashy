FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Deliberately NOT --prod: fly.toml's [deploy].release_command runs
# `node dist/db/migrate.js` from this same image, which needs drizzle-orm,
# postgres and their dev-listed peers at runtime. Accepting the larger image
# for v1 rather than maintaining a separate migration image/stage.
RUN pnpm install --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
CMD ["node", "dist/shard.js"]
