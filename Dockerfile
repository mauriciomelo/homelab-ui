# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22.17.0-bookworm-slim
ARG PNPM_VERSION=10.12.1

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY .gitignore ./
COPY apps/web ./apps/web
RUN pnpm --filter web run build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=prod-deps --chown=node:node /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist

WORKDIR /app/apps/web
USER node
EXPOSE 3000

CMD ["node", "./node_modules/srvx/bin/srvx.mjs", "--prod", "--dir", ".", "--entry", "dist/server/server.mjs", "--static", "dist/client"]
