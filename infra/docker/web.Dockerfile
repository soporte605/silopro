# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/tokens/package.json packages/tokens/
COPY packages/domain/package.json packages/domain/
COPY packages/cabinet-engine/package.json packages/cabinet-engine/
RUN pnpm install --frozen-lockfile --filter @silopro/web...
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter "./packages/*" --if-present run build \
  && pnpm --filter @silopro/web run build

FROM nginx:1.29-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
