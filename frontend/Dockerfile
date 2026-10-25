# syntax=docker/dockerfile:1.7

FROM node:22.21.1-alpine3.22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS builder
COPY . .
RUN npm run build

FROM deps AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./vite.config.ts

RUN chown node:node /app
ENV NODE_ENV=production
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "8080"]