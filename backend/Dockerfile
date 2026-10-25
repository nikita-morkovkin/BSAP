# syntax=docker/dockerfile:1.7

FROM node:22.21.1-alpine3.22 AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS builder
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:24.16.0-alpine3.22 AS tts-test
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
RUN apk add --no-cache ffmpeg
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
ENV BSAP_TTS_INTEGRATION=1 \
    TEST_REDIS_HOST=redis
CMD ["npm", "test", "--", "--runInBand", "tts.integration.spec.ts"]

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000

RUN apk add --no-cache ffmpeg \
    && addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app \
    && mkdir -p /app/projects /app/assets /app/prompts \
    && chown 10001:10001 /app/projects /app/assets /app/prompts

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

USER 10001:10001

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]