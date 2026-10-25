# syntax=docker/dockerfile:1.7

FROM node:22.21.1-alpine3.22 AS base
WORKDIR /app

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000

RUN addgroup -S -g 10002 app \
    && adduser -S -D -H -u 10002 -G app app \
    && chmod 0555 /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY src ./src

USER 10002:10002

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]